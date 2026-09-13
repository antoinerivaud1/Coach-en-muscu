"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId } from "@/lib/profile";
import { getCatalogExercises } from "@/lib/queries/exercises";
import {
  canAccessProgram,
  ensureSharedProgram,
  getProgramDayNames,
  nextOrderIndex,
} from "@/lib/queries/programs";
import {
  SEANCE_DRAFT_LIMITS,
  validateSeanceName,
  type SeanceDraftExercise,
} from "@/lib/utils/seances";

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
};

export type SaveSeanceResult =
  | { success: true; dayId: string; programId: string }
  | { success: false; error: string };

/**
 * Message unique d'une séance inexistante OU inaccessible : distinguer les
 * deux révélerait l'existence de la séance d'un autre couple (cf. CM-80).
 */
const NOT_FOUND = "Séance introuvable";

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

  const coupleId = await getCoupleId(supabase, profileId);
  if (!coupleId) {
    // Pas de programme personnel créé en silence : l'app est pensée pour le
    // couple, et une bibliothèque solo deviendrait invisible une fois le
    // couple rejoint.
    return {
      success: false,
      error: "Tu dois être en couple pour créer une séance",
    };
  }

  const checkedExercises = validateExercises(input.exercises);
  if (!checkedExercises.ok) {
    return { success: false, error: checkedExercises.error };
  }

  // Chaque exercice doit exister dans le catalogue accessible au couple : un
  // id arbitraire ne doit pas pouvoir rattacher l'exercice perso d'un autre
  // couple à cette séance.
  const { data: catalogData, error: catalogError } = await getCatalogExercises(
    supabase,
    coupleId,
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

    // `dayId` vient du client et le client serveur contourne la RLS
    // (`service_role`, CM-17) : l'appartenance se vérifie ici, en code.
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
  } else {
    const shared = await ensureSharedProgram(supabase, coupleId);
    if (!shared.ok) {
      return { success: false, error: shared.error };
    }
    programId = shared.programId;
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

  if (dayId) {
    const { error } = await supabase
      .from("program_days")
      .update({ name: checkedName.name })
      .eq("id", dayId);
    if (error) {
      return { success: false, error: error.message };
    }
    savedDayId = dayId;

    const { error: clearError } = await supabase
      .from("program_exercises")
      .delete()
      .eq("program_day_id", dayId);
    if (clearError) {
      return { success: false, error: clearError.message };
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
        error: error?.message ?? "Impossible de créer la séance",
      };
    }
    savedDayId = created.id;
  }

  const { error: insertError } = await supabase.from("program_exercises").insert(
    input.exercises.map((ex, i) => ({
      program_day_id: savedDayId,
      exercise_id: ex.exerciseId,
      target_sets: ex.targetSets,
      target_reps_min: ex.targetRepsMin,
      target_reps_max: ex.targetRepsMax,
      rest_seconds: ex.restSeconds,
      order_index: i,
    })),
  );

  if (insertError) {
    if (!dayId) {
      // La séance créée serait vide et donc inutilisable : on annule tout,
      // comme `duplicateSeance` (CM-65). En édition la séance existait déjà,
      // on la laisse en place plutôt que de la supprimer sous les pieds.
      const { error: rollbackError } = await supabase
        .from("program_days")
        .delete()
        .eq("id", savedDayId);
      if (rollbackError) {
        return {
          success: false,
          error:
            `${insertError.message}. La séance vide « ${checkedName.name} » n'a pas pu ` +
            `être nettoyée (${rollbackError.message}) : supprime-la à la main.`,
        };
      }
    }
    return { success: false, error: insertError.message };
  }

  revalidatePath("/dashboard");
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/seances");

  return { success: true, dayId: savedDayId, programId };
}
