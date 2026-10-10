"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, readDuoId, libraryTarget } from "@/lib/profile";
import { getCatalogExercises } from "@/lib/queries/exercises";
import {
  canAccessProgram,
  countLoggedSessionsForDay,
  getProgramDayNames,
  nextOrderIndex,
  resolveTargetProgram,
} from "@/lib/queries/programs";
import { duoRpcClient } from "@/lib/queries/duo";
import { duoErrorMessage, shareDecision, STALE_DUO_MESSAGE, type SeanceTarget } from "@/lib/duo";
import {
  SEANCE_DRAFT_LIMITS,
  validateSeanceName,
  type SeanceDraftExercise,
} from "@/lib/utils/seances";
import { withOrderIndex } from "@/lib/utils/reorder";
import {
  REFUSED_MESSAGE,
  touchedRows,
  writeErrorMessage,
} from "@/lib/supabase/rlsErrors";

// ─────────────────────────────────────────────────────────────────────────────
// Écran unique de création / édition d'une séance type (CM-81).
//
// Rappel schéma : une séance type reste une ligne de `program_days`, rattachée
// à un `programs`. La notion de programme n'existe plus dans l'UI : le
// programme partagé du couple est créé en silence à la première séance
// (`ensureSharedProgram`) puis toujours réutilisé.
// ─────────────────────────────────────────────────────────────────────────────

export type SaveSeanceInput = {
  /** Absent = création. */
  dayId?: string;
  /** Déjà proposé ou saisi côté client ; le serveur revalide. */
  name: string;
  exercises: SeanceDraftExercise[];
  /**
   * CM-87, en duo seulement (refusé sinon : page périmée) : « Pour nous
   * deux » (`duo`) ou « Pour moi » (`perso`). En création, choisit la
   * bibliothèque (défaut : `duo`). En édition, avec `initialTarget` : seul un
   * CHANGEMENT du choix affiché déplace la séance (« Partager avec … » /
   * « Garder pour moi »), après relecture de l'état réel (C2).
   */
  target?: SeanceTarget;
  /** Édition : choix affiché à l'ouverture de l'écran. */
  initialTarget?: SeanceTarget;
};

export type SaveSeanceResult =
  | {
      success: true;
      dayId: string;
      programId: string;
      /** Message à afficher dans la bibliothèque (copie au lieu d'un déplacement). */
      notice?: string;
    }
  | { success: false; error: string };

/**
 * Message unique d'une séance inexistante OU inaccessible : distinguer les
 * deux révélerait l'existence de la séance d'un autre couple (cf. CM-80).
 */
const NOT_FOUND = "Séance introuvable";

/**
 * Les deux écrans qui montrent des séances types : la bibliothèque et la
 * grille de l'accueil. Toute écriture sur une séance les invalide.
 */
function revalidateLibrary() {
  revalidatePath("/seances");
  revalidatePath("/dashboard");
}

/**
 * Les actions déclenchées par un `<form action={...}>` ne peuvent pas renvoyer
 * de résultat à l'écran d'origine : elles redirigent. On fait donc voyager le
 * message d'erreur en query string, et la page cible l'affiche (CM-70).
 */
function redirectWithError(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

/**
 * Le profil courant peut-il agir sur la séance de ce programme ?
 *
 * Les ids de séance arrivent du client. La RLS (CM-59 B) refuse déjà d'agir
 * sur la séance d'un autre duo ; cette vérification reste en place (ceinture
 * et bretelles, et filet `DATA_CLIENT=service`). Une séance inaccessible renvoie le même
 * message qu'une séance inexistante, on ne révèle pas qu'elle existe (CM-80).
 *
 * `cancelled` complète le message quand la vérification elle-même échoue :
 * l'action est alors refusée, jamais autorisée par défaut.
 */
async function checkSeanceAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  programId: string,
  profileId: string,
  cancelled: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const access = await canAccessProgram(supabase, programId, profileId);
  if (!access.ok) {
    return {
      ok: false,
      error: `Impossible de vérifier l'accès à cette séance (${access.error}). ${cancelled}`,
    };
  }
  if (!access.allowed) {
    return { ok: false, error: NOT_FOUND };
  }
  return { ok: true };
}

/**
 * Bornes et doublons des exercices reçus.
 *
 * Le client applique déjà ces règles (les boutons − / + s'y arrêtent) mais un
 * brouillon reste une donnée envoyée par le navigateur : c'est cette
 * validation-ci qui fait foi. `exerciseIds` renvoyé sert ensuite à vérifier
 * que chacun existe bien dans le catalogue accessible.
 */
function validateExercises(
  exercises: SeanceDraftExercise[],
): { ok: true; exerciseIds: string[] } | { ok: false; error: string } {
  if (exercises.length === 0) {
    return { ok: false, error: "Ajoute au moins un exercice à cette séance" };
  }

  const { sets, reps, rest } = SEANCE_DRAFT_LIMITS;
  const seen = new Set<string>();

  for (const ex of exercises) {
    const id = ex.exerciseId?.trim();
    if (!id) {
      return { ok: false, error: "Un exercice de la séance est invalide" };
    }
    if (seen.has(id)) {
      return {
        ok: false,
        error: `« ${ex.name} » est en double dans la séance`,
      };
    }
    seen.add(id);

    const inBounds = (value: number, min: number, max: number) =>
      Number.isInteger(value) && value >= min && value <= max;

    if (!inBounds(ex.targetSets, sets.min, sets.max)) {
      return {
        ok: false,
        error: `« ${ex.name} » : le nombre de séries doit être entre ${sets.min} et ${sets.max}`,
      };
    }
    if (
      !inBounds(ex.targetRepsMin, reps.min, reps.max) ||
      !inBounds(ex.targetRepsMax, reps.min, reps.max)
    ) {
      return {
        ok: false,
        error: `« ${ex.name} » : les répétitions doivent être entre ${reps.min} et ${reps.max}`,
      };
    }
    if (ex.targetRepsMin > ex.targetRepsMax) {
      return {
        ok: false,
        error: `« ${ex.name} » : le minimum de répétitions dépasse le maximum`,
      };
    }
    if (!inBounds(ex.restSeconds, rest.min, rest.max)) {
      return {
        ok: false,
        error: `« ${ex.name} » : le repos doit être entre ${rest.min} et ${rest.max} secondes`,
      };
    }
  }

  return { ok: true, exerciseIds: [...seen] };
}

/**
 * Crée ou met à jour une séance type et TOUS ses exercices en un seul appel.
 *
 * En édition les `program_exercises` sont remplacés (delete puis insert dans
 * l'ordre reçu) plutôt que diffés : les `session_sets` référencent
 * `exercise_id`, pas `program_exercises`, donc aucun historique n'est perdu et
 * l'écriture reste simple à relire.
 */
export async function saveSeance(
  input: SaveSeanceInput,
): Promise<SaveSeanceResult> {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  // CM-86 / CM-87 : sans partenaire, bibliothèque perso ; en duo, celle que
  // l'utilisateur a choisie (`resolveTargetProgram`). Duo illisible (C3) :
  // refus, jamais de séance rangée en perso par erreur.
  const library = libraryTarget(await readDuoId(supabase, profileId));
  if (library.kind === "error") {
    return { success: false, error: library.error };
  }
  if (library.kind === "personal" && (input.target || input.initialTarget)) {
    return { success: false, error: STALE_DUO_MESSAGE };
  }
  const duoId = library.kind === "shared" ? library.duoId : null;
  let notice: string | undefined;

  const checkedExercises = validateExercises(input.exercises);
  if (!checkedExercises.ok) {
    return { success: false, error: checkedExercises.error };
  }

  // Chaque exercice doit exister dans le catalogue accessible (système, mes
  // exercices perso, ceux du duo) : un id arbitraire ne doit pas pouvoir
  // rattacher l'exercice perso d'un autre compte à cette séance.
  const { data: catalogData, error: catalogError } = await getCatalogExercises(
    supabase,
    duoId,
    profileId,
  );
  if (catalogError) {
    return {
      success: false,
      error: `Impossible de vérifier les exercices (${catalogError.message}). Enregistrement annulé.`,
    };
  }
  const catalogIds = new Set((catalogData ?? []).map((e) => e.id));
  if (checkedExercises.exerciseIds.some((id) => !catalogIds.has(id))) {
    return {
      success: false,
      error: "Un exercice de la séance n'existe pas dans ton catalogue",
    };
  }

  const dayId = input.dayId?.trim();

  // ----- Programme d'accueil + séance cible -----
  let programId: string;
  let excludeDayId: string | null = null;
  /** Séance réellement modifiée (la copie perso si la RPC a copié, C1). */
  let editDayId = dayId;

  if (dayId) {
    const { data: day, error: dayError } = await supabase
      .from("program_days")
      .select("id, program_id")
      .eq("id", dayId)
      .returns<{ id: string; program_id: string }[]>()
      .maybeSingle();

    if (dayError) {
      return { success: false, error: dayError.message };
    }
    if (!day) {
      return { success: false, error: NOT_FOUND };
    }

    // `dayId` vient du client : l'appartenance se vérifie aussi ici, en code
    // (en plus de la RLS, CM-59 B).
    const access = await canAccessProgram(supabase, day.program_id, profileId);
    if (!access.ok) {
      return {
        success: false,
        error: `Impossible de vérifier l'accès à cette séance (${access.error}). Enregistrement annulé.`,
      };
    }
    if (!access.allowed) {
      return { success: false, error: NOT_FOUND };
    }

    programId = day.program_id;
    excludeDayId = day.id;

    // CM-87 : « Partager avec … » / « Garder pour moi » (C2). Seulement si
    // l'utilisateur a changé le choix affiché, après relecture de l'état
    // réel ; une lecture en échec ne bascule jamais rien. La RPC refuse un
    // nom déjà pris AVANT tout changement, et COPIE au lieu de déplacer une
    // séance du duo que le partenaire a déjà utilisée (C1).
    if (duoId && input.target && input.initialTarget && input.target !== input.initialTarget) {
      const { data: prog, error: progError } = await supabase
        .from("programs")
        .select("duo_id")
        .eq("id", day.program_id)
        .returns<{ duo_id: string | null }[]>()
        .maybeSingle();
      const actual: SeanceTarget | null =
        progError || !prog ? null : prog.duo_id ? "duo" : "perso";
      const decision = shareDecision(input.initialTarget, input.target, actual);
      if (decision.kind === "error") {
        return {
          success: false,
          error: "Impossible de vérifier où est rangée cette séance. Rien n'a été modifié.",
        };
      }
      if (decision.kind === "stale") {
        return { success: false, error: STALE_DUO_MESSAGE };
      }
      if (decision.kind === "toggle") {
        const rpc = await duoRpcClient();
        const { data: moved, error: moveError } = await rpc.rpc("set_seance_shared", {
          p_day_id: day.id,
          p_shared: decision.shared,
        });
        if (moveError) {
          return { success: false, error: duoErrorMessage(moveError.message) };
        }
        const result = moved?.[0];
        if (result?.status === "copied" && result.day_id) {
          // L'original reste dans « Nos séances » : les modifications de
          // l'écran s'appliquent à la copie perso.
          editDayId = result.day_id;
          excludeDayId = result.day_id;
          notice =
            "Une copie a été ajoutée à « Mes séances ». La séance reste aussi dans « Nos séances » : ton partenaire l'a déjà utilisée.";
        }
        const { data: now, error: nowError } = await supabase
          .from("program_days")
          .select("program_id")
          .eq("id", editDayId ?? day.id)
          .returns<{ program_id: string }[]>()
          .maybeSingle();
        if (nowError) return { success: false, error: nowError.message };
        if (!now) return { success: false, error: NOT_FOUND };
        programId = now.program_id;
      }
    }
  } else {
    const target = await resolveTargetProgram(supabase, {
      profileId,
      library,
      target: input.target,
    });
    if (!target.ok) {
      return { success: false, error: target.error };
    }
    programId = target.programId;
  }

  // ----- Nom -----
  const siblings = await getProgramDayNames(supabase, programId);
  // Sans la liste des voisines l'unicité ne peut pas être vérifiée : on refuse
  // plutôt que d'écrire un doublon (même logique que `renameSeance`, CM-80).
  if (!siblings.ok) {
    return {
      success: false,
      error: `Impossible de vérifier les noms déjà pris (${siblings.error}). Enregistrement annulé.`,
    };
  }
  const otherNames = siblings.days
    .filter((d) => d.id !== excludeDayId)
    .map((d) => d.name);

  const checkedName = validateSeanceName(input.name, otherNames);
  if (!checkedName.ok) {
    return { success: false, error: checkedName.error };
  }

  // ----- Écriture de la séance -----
  let savedDayId: string;

  if (editDayId) {
    // CM-59 B : sous RLS, un update refusé touche 0 ligne sans erreur.
    const { data: renamed, error } = await supabase
      .from("program_days")
      .update({ name: checkedName.name })
      .eq("id", editDayId)
      .select("id");
    if (error) {
      return { success: false, error: writeErrorMessage(error) };
    }
    if (!touchedRows(renamed)) {
      return { success: false, error: REFUSED_MESSAGE };
    }
    savedDayId = editDayId;

    // 0 ligne ici n'est PAS un refus : la séance peut être vide. L'accès à la
    // séance vient d'être prouvé par l'update ci-dessus.
    const { error: clearError } = await supabase
      .from("program_exercises")
      .delete()
      .eq("program_day_id", editDayId);
    if (clearError) {
      return { success: false, error: writeErrorMessage(clearError) };
    }
  } else {
    const order = await nextOrderIndex(supabase, programId);
    if (!order.ok) {
      return { success: false, error: order.error };
    }

    const { data: created, error } = await supabase
      .from("program_days")
      .insert({
        program_id: programId,
        name: checkedName.name,
        order_index: order.value,
      })
      .select("id")
      .returns<{ id: string }[]>()
      .single();

    if (error || !created) {
      return {
        success: false,
        error: error ? writeErrorMessage(error) : "Impossible de créer la séance",
      };
    }
    savedDayId = created.id;
  }

  // CM-71 : l'ordre reçu est celui de l'éditeur (flèches monter / descendre),
  // renuméroté 0..n-1. Les séances démarrées ensuite le suivent, via le tri
  // `order_index` de `buildSessionExercises`.
  const { error: insertError } = await supabase.from("program_exercises").insert(
    withOrderIndex(input.exercises).map((ex) => ({
      program_day_id: savedDayId,
      exercise_id: ex.exerciseId,
      target_sets: ex.targetSets,
      target_reps_min: ex.targetRepsMin,
      target_reps_max: ex.targetRepsMax,
      rest_seconds: ex.restSeconds,
      order_index: ex.order_index,
    })),
  );

  if (insertError) {
    const insertMessage = writeErrorMessage(insertError);
    if (!dayId) {
      // La séance créée serait vide et donc inutilisable : on annule tout,
      // comme `duplicateSeance` (CM-65). En édition la séance existait déjà,
      // on la laisse en place plutôt que de la supprimer sous les pieds.
      const { data: rolledBack, error: rollbackError } = await supabase
        .from("program_days")
        .delete()
        .eq("id", savedDayId)
        .select("id");
      if (rollbackError || !touchedRows(rolledBack)) {
        const rollbackMessage = rollbackError
          ? writeErrorMessage(rollbackError)
          : REFUSED_MESSAGE;
        return {
          success: false,
          error:
            `${insertMessage}. La séance vide « ${checkedName.name} » n'a pas pu ` +
            `être nettoyée (${rollbackMessage}) : supprime-la à la main.`,
        };
      }
    }
    return { success: false, error: insertMessage };
  }

  // CM-87 : une séance du duo n'utilise que des exercices visibles des deux.
  // Mes exercices perso qu'elle contient deviennent des exercices du duo.
  if (duoId) {
    const { data: prog } = await supabase
      .from("programs")
      .select("duo_id")
      .eq("id", programId)
      .returns<{ duo_id: string | null }[]>()
      .maybeSingle();
    if (prog?.duo_id === duoId) {
      const { error: shareError } = await supabase
        .from("exercises")
        .update({ owner_profile_id: null, duo_id: duoId })
        .eq("owner_profile_id", profileId)
        .in("id", checkedExercises.exerciseIds);
      if (shareError) {
        return { success: false, error: writeErrorMessage(shareError) };
      }
    }
  }

  revalidateLibrary();

  return { success: true, dayId: savedDayId, programId, notice };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bibliothèque « Mes séances » (CM-65, déplacée depuis `/programs/[id]` en
// CM-81)
//
// Rappel schéma : une séance type = une ligne de `program_days`. Le nom des
// tables et colonnes est inchangé, seul le vocabulaire de l'UI parle de
// « séance ».
// ─────────────────────────────────────────────────────────────────────────────

export type SeanceActionResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Démarre une séance depuis la bibliothèque ou la grille de l'accueil.
 *
 * `day_id` vient d'un champ caché du formulaire : son appartenance est
 * vérifiée ici avant d'insérer la session, sans quoi un id arbitraire
 * rattacherait une séance à la bibliothèque d'un autre couple (CM-82).
 */
export async function startSession(formData: FormData) {
  const dayId = String(formData.get("day_id") ?? "").trim();
  if (!dayId) {
    redirectWithError("/dashboard", "Séance introuvable : impossible de démarrer.");
  }

  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: day, error: dayError } = await supabase
    .from("program_days")
    .select("id, program_id")
    .eq("id", dayId)
    .returns<{ id: string; program_id: string }[]>()
    .maybeSingle();

  if (dayError) {
    redirectWithError(
      "/dashboard",
      `Impossible de démarrer la séance : ${dayError.message}`,
    );
  }
  if (!day) {
    redirectWithError("/dashboard", `${NOT_FOUND} : impossible de démarrer.`);
  }

  const access = await checkSeanceAccess(
    supabase,
    day.program_id,
    profileId,
    "Démarrage annulé.",
  );
  if (!access.ok) {
    redirectWithError("/dashboard", access.error);
  }

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ profile_id: profileId, program_day_id: dayId })
    .select("id")
    .single();

  if (error || !session) {
    redirectWithError(
      "/dashboard",
      `Impossible de démarrer la séance : ${error ? writeErrorMessage(error) : "erreur inconnue"}`,
    );
  }

  redirect(`/sessions/${session.id}`);
}

/**
 * Duplique une séance et TOUS ses exercices (séries, reps, repos, ordre).
 * La copie est ajoutée en fin de bibliothèque.
 */
export async function duplicateSeance(
  dayId: string,
): Promise<SeanceActionResult> {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("program_days")
    .select(
      `id, name, program_id,
       program_exercises (
         exercise_id, target_sets, target_reps_min, target_reps_max,
         rest_seconds, order_index
       )`,
    )
    .eq("id", dayId)
    .returns<
      {
        id: string;
        name: string;
        program_id: string;
        program_exercises: {
          exercise_id: string;
          target_sets: number;
          target_reps_min: number;
          target_reps_max: number;
          rest_seconds: number;
          order_index: number;
        }[];
      }[]
    >()
    .maybeSingle();

  if (sourceError) {
    return { success: false, error: sourceError.message };
  }
  if (!source) {
    return { success: false, error: NOT_FOUND };
  }

  const access = await checkSeanceAccess(
    supabase,
    source.program_id,
    profileId,
    "Duplication annulée.",
  );
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const order = await nextOrderIndex(supabase, source.program_id);
  if (!order.ok) {
    return { success: false, error: order.error };
  }

  const { data: copy, error: copyError } = await supabase
    .from("program_days")
    .insert({
      program_id: source.program_id,
      name: `${source.name} (copie)`,
      order_index: order.value,
    })
    .select("id")
    .single();

  if (copyError || !copy) {
    return {
      success: false,
      error: copyError ? writeErrorMessage(copyError) : "Erreur lors de la duplication",
    };
  }

  const exercises = source.program_exercises ?? [];
  if (exercises.length > 0) {
    const { error: exError } = await supabase.from("program_exercises").insert(
      exercises.map((pe) => ({
        program_day_id: copy.id,
        exercise_id: pe.exercise_id,
        target_sets: pe.target_sets,
        target_reps_min: pe.target_reps_min,
        target_reps_max: pe.target_reps_max,
        rest_seconds: pe.rest_seconds,
        order_index: pe.order_index,
      })),
    );

    if (exError) {
      const exMessage = writeErrorMessage(exError);
      // La copie serait vide et donc inutilisable : on annule tout.
      const { data: rolledBack, error: rollbackError } = await supabase
        .from("program_days")
        .delete()
        .eq("id", copy.id)
        .select("id");
      if (rollbackError || !touchedRows(rolledBack)) {
        const rollbackMessage = rollbackError
          ? writeErrorMessage(rollbackError)
          : REFUSED_MESSAGE;
        return {
          success: false,
          error:
            `${exMessage}. La copie vide « ${source.name} (copie) » n'a pas pu ` +
            `être nettoyée (${rollbackMessage}) : supprime-la à la main.`,
        };
      }
      return { success: false, error: exMessage };
    }
  }

  revalidateLibrary();
  return { success: true };
}

/**
 * Supprime une séance type.
 *
 * `sessions.program_day_id` est en ON DELETE SET NULL : supprimer une séance
 * déjà réalisée ne supprimerait pas l'historique mais le détacherait en
 * silence (les séances passées perdraient leur nom). On bloque donc la
 * suppression dès qu'au moins une séance a réellement été loggée dessus.
 * Les sessions vides (aucune série enregistrée) ne bloquent pas.
 */
export async function deleteSeance(dayId: string): Promise<SeanceActionResult> {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: day, error: dayError } = await supabase
    .from("program_days")
    .select("id, name, program_id")
    .eq("id", dayId)
    .returns<{ id: string; name: string; program_id: string }[]>()
    .maybeSingle();

  if (dayError) {
    return { success: false, error: dayError.message };
  }
  if (!day) {
    return { success: false, error: NOT_FOUND };
  }

  const access = await checkSeanceAccess(
    supabase,
    day.program_id,
    profileId,
    "Suppression annulée.",
  );
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const logged = await countLoggedSessionsForDay(supabase, dayId);
  // Comptage impossible : on refuse la suppression plutôt que de détacher un
  // historique par défaut (CM-70).
  if (!logged.ok) {
    return {
      success: false,
      error:
        `Impossible de vérifier l'historique de « ${day.name} » (${logged.error}). ` +
        "Suppression annulée par sécurité.",
    };
  }
  if (logged.count > 0) {
    const n = logged.count;
    return {
      success: false,
      error:
        `Impossible de supprimer « ${day.name} » : ${n} séance${n > 1 ? "s" : ""} ` +
        `déjà réalisée${n > 1 ? "s" : ""} y ${n > 1 ? "sont rattachées" : "est rattachée"}. ` +
        "La supprimer détacherait cet historique. Renomme-la ou vide-la de ses exercices.",
    };
  }

  // CM-59 B : sous RLS, un delete refusé touche 0 ligne sans erreur.
  const { data: deleted, error } = await supabase
    .from("program_days")
    .delete()
    .eq("id", dayId)
    .select("id");

  if (error) {
    return { success: false, error: writeErrorMessage(error) };
  }
  if (!touchedRows(deleted)) {
    return { success: false, error: REFUSED_MESSAGE };
  }

  revalidateLibrary();
  return { success: true };
}

/**
 * Monte ou descend une séance dans la bibliothèque.
 *
 * Pas de drag and drop : deux boutons monter / descendre, fiables au doigt sur
 * iOS. Les `order_index` de toute la bibliothèque sont réécrits en 0..n-1, ce
 * qui rattrape au passage d'éventuels trous ou doublons.
 */
export async function moveSeance(
  dayId: string,
  direction: "up" | "down",
): Promise<SeanceActionResult> {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: day, error: dayError } = await supabase
    .from("program_days")
    .select("id, program_id")
    .eq("id", dayId)
    .returns<{ id: string; program_id: string }[]>()
    .maybeSingle();

  if (dayError) {
    return { success: false, error: dayError.message };
  }
  if (!day) {
    return { success: false, error: NOT_FOUND };
  }

  const access = await checkSeanceAccess(
    supabase,
    day.program_id,
    profileId,
    "Réordonnancement annulé.",
  );
  if (!access.ok) {
    return { success: false, error: access.error };
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from("program_days")
    .select("id, order_index")
    .eq("program_id", day.program_id)
    .order("order_index", { ascending: true })
    .returns<{ id: string; order_index: number }[]>();

  // CM-70 : une erreur ici renvoyait une liste vide, donc `from === -1`, donc
  // `{ success: true }` — un échec complet rapporté comme une réussite.
  if (siblingsError) {
    return { success: false, error: siblingsError.message };
  }

  const ordered = siblings ?? [];
  const from = ordered.findIndex((d) => d.id === dayId);
  if (from === -1) {
    return {
      success: false,
      error: "Séance introuvable dans la bibliothèque : réordonnancement annulé.",
    };
  }

  const to = direction === "up" ? from - 1 : from + 1;
  // Déjà en butée : rien à faire, ce n'est pas une erreur.
  if (to < 0 || to >= ordered.length) {
    return { success: true };
  }

  const reordered = [...ordered];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved!);

  for (let i = 0; i < reordered.length; i++) {
    const current = reordered[i]!;
    if (current.order_index === i) continue;
    // CM-59 B : sous RLS, un update refusé touche 0 ligne sans erreur.
    const { data: moved, error } = await supabase
      .from("program_days")
      .update({ order_index: i })
      .eq("id", current.id)
      .select("id");
    if (error) {
      return { success: false, error: writeErrorMessage(error) };
    }
    if (!touchedRows(moved)) {
      return { success: false, error: REFUSED_MESSAGE };
    }
  }

  revalidateLibrary();
  return { success: true };
}
