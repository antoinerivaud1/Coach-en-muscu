import type { BrowserSupabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/auth/core";
import {
  canAccessProgram,
  getDayWithExercises,
  getPersonalProgramId,
  getProgramDayNames,
  getProgramWithDays,
  getSharedProgramId,
  readPersonalProgramId,
  type ProgramFull,
} from "@/lib/queries/programs";
import { getLastDoneByDay } from "@/lib/queries/sessions";
import { getMemberProfiles, readMemberProfiles } from "@/lib/queries/profiles";
import { DUO_READ_ERROR_MESSAGE } from "@/lib/duoMembership";
import {
  STALE_DUO_MESSAGE,
  duoErrorCode,
  duoErrorMessage,
  toMembers,
  type Member,
  type SeanceTarget,
} from "@/lib/duo";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import {
  SEANCE_DRAFT_LIMITS,
  SEANCE_NAME_MAX_LENGTH,
  countSets,
  deriveMuscleTags,
  splitVisibleTags,
  type MuscleGroup,
  type SeanceDraftExercise,
} from "@/lib/utils/seances";
import { REFUSED_MESSAGE, writeErrorMessage } from "@/lib/supabase/rlsErrors";

/**
 * CM-88 (PR 5) : séances types côté client (bibliothèque `/seances` et
 * éditeur `/seances/new`, `/seances/edit?id=`), sous RLS.
 *
 * - Lectures : `fetchSeanceLibrary`, `fetchSeanceEditor` (une lecture
 *   essentielle en échec LÈVE, l'écran propose « Réessayer »).
 * - Écritures : `saveSeance`, `duplicateSeance`, `moveSeance`, `deleteSeance`
 *   passent par des RPC atomiques
 *   (supabase/migrations/20261011200000_cm88_seances_types.sql) : tout ou
 *   rien, même si le réseau coupe. Convention de ce fichier : une écriture ne lève jamais,
 *   elle renvoie `{ ok: true, … } | { ok: false, error }` avec un message en
 *   français prêt à être affiché (mêmes textes que les server actions
 *   qu'elles remplacent, ex-app/seances/actions.ts).
 *
 * Rappel schéma : une séance type est une ligne de `program_days`, rattachée
 * à un `programs` (perso ou du duo). La notion de programme n'existe plus
 * dans l'UI.
 */

export type SeanceWriteResult = { ok: true } | { ok: false; error: string };

/**
 * Message unique d'une séance inexistante OU inaccessible : distinguer les
 * deux révélerait l'existence de la séance d'un autre couple (CM-80).
 */
export const SEANCE_NOT_FOUND = "Séance introuvable";

/** Copie au lieu d'un déplacement (CM-87, C1), affiché dans la bibliothèque. */
export const SEANCE_COPIED_NOTICE =
  "Une copie a été ajoutée à « Mes séances ». La séance reste aussi dans « Nos séances » : ton partenaire l'a déjà utilisée.";

/**
 * Le profil courant peut-il agir sur la séance de ce programme ?
 *
 * Les ids de séance arrivent de l'URL ou de l'écran. La RLS (CM-59 B) refuse
 * déjà d'agir sur la séance d'un autre duo ; cette vérification reste en
 * place (ceinture et bretelles). Une séance inaccessible renvoie le même
 * message qu'une séance inexistante (CM-80). Utilisée par le démarrage d'une
 * séance (lib/data/sessionStart.ts) ; les RPC font le même contrôle en base.
 *
 * `cancelled` complète le message quand la vérification elle-même échoue :
 * l'action est alors refusée, jamais autorisée par défaut.
 */
export async function checkSeanceAccess(
  supabase: BrowserSupabase,
  programId: string,
  profileId: string,
  cancelled: string,
): Promise<SeanceWriteResult> {
  const access = await canAccessProgram(supabase, programId, profileId);
  if (!access.ok) {
    return {
      ok: false,
      error: `Impossible de vérifier l'accès à cette séance (${access.error}). ${cancelled}`,
    };
  }
  if (!access.allowed) {
    return { ok: false, error: SEANCE_NOT_FOUND };
  }
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bibliothèque
// ─────────────────────────────────────────────────────────────────────────────

export type SeanceExerciseView = {
  id: string;
  name: string;
  groupLabel: string;
  targetSets: number;
  repsMin: number;
  repsMax: number;
};

export type SeanceView = {
  id: string;
  name: string;
  exerciseCount: number;
  setCount: number;
  tags: string[];
  extraTags: number;
  /** Dernière exécution TERMINÉE de cette séance par le profil courant. */
  lastDoneAt: string | null;
  exercises: SeanceExerciseView[];
};

/** Séances types d'un programme, prêtes pour `SeanceLibrary` (tags dérivés, CM-65). */
export function toSeanceViews(
  program: ProgramFull | null,
  lastDoneByDay: Map<string, string>,
): SeanceView[] {
  const days = [...(program?.program_days ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  );
  return days.map((day) => {
    const exercises = [...day.program_exercises].sort(
      (a, b) => a.order_index - b.order_index,
    );
    const groups = exercises
      .map((pe) => pe.exercises?.muscle_group)
      .filter((g): g is MuscleGroup => Boolean(g));
    const { visible, overflow } = splitVisibleTags(deriveMuscleTags(groups));

    return {
      id: day.id,
      name: day.name,
      exerciseCount: exercises.length,
      setCount: countSets(exercises),
      tags: visible.map((t) => t.label),
      extraTags: overflow,
      lastDoneAt: lastDoneByDay.get(day.id) ?? null,
      exercises: exercises.map((pe) => ({
        id: pe.id,
        name: pe.exercises?.name ?? "Exercice",
        groupLabel: pe.exercises
          ? (MUSCLE_GROUP_LABELS[pe.exercises.muscle_group] ??
            pe.exercises.muscle_group)
          : "",
        targetSets: pe.target_sets,
        repsMin: pe.target_reps_min,
        repsMax: pe.target_reps_max,
      })),
    };
  });
}

export type SeanceLibraryData = {
  /** Duo ACTIF, null en solo. */
  duoId: string | null;
  /** Moi d'abord, puis le partenaire (prénom et couleur). */
  members: Member[];
  /** « Nos séances » (duo seulement). */
  ours: SeanceView[];
  /** « Mes séances ». */
  mine: SeanceView[];
};

/** Message de l'écran quand la bibliothèque ne peut pas être lue. */
function libraryLoadError(detail?: string): Error {
  return new Error(
    `Impossible de charger tes séances${detail ? ` (${detail})` : ""}. Réessaie dans un instant.`,
  );
}

/**
 * Bibliothèque complète (CM-81, CM-86, CM-87) : en duo, « Nos séances » (le
 * programme du duo) puis « Mes séances » (le programme perso) ; en solo, la
 * bibliothèque perso seule.
 *
 * Lecture seule : aucun programme n'est créé ici (l'ancienne page créait
 * celui du duo à l'affichage ; c'est désormais `save_seance` qui le crée à la
 * première séance enregistrée). C3 : duo illisible => erreur, jamais
 * « solo » par défaut.
 */
export async function fetchSeanceLibrary(
  supabase: BrowserSupabase,
  profileId: string,
): Promise<SeanceLibraryData> {
  const read = await readMemberProfiles(supabase, profileId);
  if (!read.ok) throw new Error(DUO_READ_ERROR_MESSAGE);
  const { duoId, profiles } = read;

  let shared: ProgramFull | null = null;
  if (duoId) {
    const { data: rows, error } = await supabase
      .from("programs")
      .select("id")
      .eq("duo_id", duoId)
      .is("owner_profile_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .returns<{ id: string }[]>();
    if (error) throw libraryLoadError(error.message);
    const sharedId = rows?.[0]?.id;
    if (sharedId) {
      const { data, error: programError } = await getProgramWithDays(supabase, sharedId);
      if (programError) throw libraryLoadError(programError.message);
      if (!data) throw libraryLoadError();
      shared = data;
    }
  }

  // Perso : lu, jamais créé ici (vide tant qu'aucune séance n'y est rangée).
  let personal: ProgramFull | null = null;
  const personalId = await readPersonalProgramId(supabase, profileId);
  if (!personalId.ok) throw libraryLoadError(personalId.error);
  if (personalId.programId) {
    const { data, error } = await getProgramWithDays(supabase, personalId.programId);
    if (error) throw libraryLoadError(error.message);
    if (!data) throw libraryLoadError();
    personal = data;
  }

  const allDayIds = [...(shared?.program_days ?? []), ...(personal?.program_days ?? [])].map(
    (d) => d.id,
  );
  // « Dernière fois » du profil courant, même calcul que l'accueil.
  const lastDoneByDay = await getLastDoneByDay(supabase, profileId, allDayIds);

  return {
    duoId,
    members: toMembers(profiles, profileId),
    ours: toSeanceViews(shared, lastDoneByDay),
    mine: toSeanceViews(personal, lastDoneByDay),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Éditeur
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CM-87 : choix « Pour nous deux » / « Pour moi » (création) ou « Partager
 * avec … » / « Garder pour moi » (édition). Absent pour un utilisateur sans
 * partenaire : le choix n'existe qu'en duo.
 */
export type OwnerChoice = {
  partnerName: string;
  myColor: string;
  /** Création : `duo` par défaut. Édition : bibliothèque actuelle. */
  initial: SeanceTarget;
  /** Noms déjà pris de chaque côté (la séance éditée exclue). */
  otherNamesByTarget: Record<SeanceTarget, string[]>;
};

export type SeanceEditorData =
  /** Création seulement : duo illisible (C3), rien ne peut être rangé. */
  | { kind: "duoError" }
  /** Édition : séance inexistante ou inaccessible (même cas, CM-80). */
  | { kind: "notFound" }
  | {
      kind: "ready";
      dayId?: string;
      initialName: string;
      initialExercises: SeanceDraftExercise[];
      /** Noms des AUTRES séances de la bibliothèque d'arrivée. */
      otherNames: string[];
      owner?: OwnerChoice;
    };

/** Noms des séances d'un programme (sauf `excludeId`), [] si illisible (affichage). */
async function namesOf(
  supabase: BrowserSupabase,
  programId: string | null,
  excludeId?: string,
): Promise<string[]> {
  if (!programId) return [];
  const siblings = await getProgramDayNames(supabase, programId);
  return siblings.ok
    ? siblings.days.filter((d) => d.id !== excludeId).map((d) => d.name)
    : [];
}

/**
 * Données de l'éditeur, création (`dayId` null) ou édition. Mêmes lectures
 * que les anciennes pages serveur ; le catalogue d'exercices est lu à part
 * (`useCatalogExercises`, cache partagé avec le Guide).
 */
export async function fetchSeanceEditor(
  supabase: BrowserSupabase,
  profileId: string,
  dayId: string | null,
): Promise<SeanceEditorData> {
  if (!dayId) {
    // CM-86 : sans partenaire, la séance ira dans la bibliothèque perso.
    // CM-87 : en duo, « Pour nous deux » (défaut) / « Pour moi ».
    const read = await readMemberProfiles(supabase, profileId);
    if (!read.ok) return { kind: "duoError" };
    const { duoId, profiles } = read;
    const members = toMembers(profiles, profileId);
    const partner = members.find((m) => !m.isMe);
    const me = members.find((m) => m.isMe);
    const persoNames = await namesOf(supabase, await getPersonalProgramId(supabase, profileId));
    const duoNames = duoId
      ? await namesOf(supabase, await getSharedProgramId(supabase, duoId))
      : [];
    return {
      kind: "ready",
      initialName: "",
      initialExercises: [],
      otherNames: duoId ? duoNames : persoNames,
      owner:
        duoId && partner && me
          ? {
              partnerName: partner.name,
              myColor: me.color,
              initial: "duo",
              otherNamesByTarget: { duo: duoNames, perso: persoNames },
            }
          : undefined,
    };
  }

  // `dayId` vient de l'URL : l'appartenance est vérifiée en code, en plus de
  // la RLS (CM-59 B). Inaccessible ou mal formé = introuvable.
  if (!isUuid(dayId)) return { kind: "notFound" };
  const { data: day, error } = await getDayWithExercises(supabase, dayId);
  if (error) throw new Error(`Impossible de charger cette séance (${error.message}).`);
  if (!day) return { kind: "notFound" };
  const access = await canAccessProgram(supabase, day.program_id, profileId);
  if (!access.ok) throw new Error(`Impossible de charger cette séance (${access.error}).`);
  if (!access.allowed) return { kind: "notFound" };

  const { duoId, profiles } = await getMemberProfiles(supabase, profileId);
  const members = toMembers(profiles, profileId);
  const partner = members.find((m) => !m.isMe);
  const me = members.find((m) => m.isMe);

  const initialExercises: SeanceDraftExercise[] = [...day.program_exercises]
    .sort((a, b) => a.order_index - b.order_index)
    .map((pe) => ({
      exerciseId: pe.exercise_id,
      name: pe.exercises?.name ?? "Exercice",
      muscleGroup: (pe.exercises?.muscle_group ?? "other") as MuscleGroup,
      targetSets: pe.target_sets,
      targetRepsMin: pe.target_reps_min,
      targetRepsMax: pe.target_reps_max,
      restSeconds: pe.rest_seconds,
    }));

  const otherNames = await namesOf(supabase, day.program_id, day.id);

  // CM-87 : en duo, « Partager avec … » / « Garder pour moi ».
  let owner: OwnerChoice | undefined;
  if (duoId && partner && me) {
    const { data: prog, error: progError } = await supabase
      .from("programs")
      .select("duo_id")
      .eq("id", day.program_id)
      .returns<{ duo_id: string | null }[]>()
      .maybeSingle();
    // C2 : état illisible => pas de choix affiché (rien ne sera basculé).
    if (!progError && prog) {
      const shared = Boolean(prog.duo_id);
      const otherSide = shared
        ? await namesOf(supabase, await getPersonalProgramId(supabase, profileId), day.id)
        : await namesOf(supabase, await getSharedProgramId(supabase, duoId), day.id);
      owner = {
        partnerName: partner.name,
        myColor: me.color,
        initial: shared ? "duo" : "perso",
        otherNamesByTarget: shared
          ? { duo: otherNames, perso: otherSide }
          : { duo: otherSide, perso: otherNames },
      };
    }
  }

  return {
    kind: "ready",
    dayId: day.id,
    initialName: day.name,
    initialExercises,
    otherNames,
    owner,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Écritures
// ─────────────────────────────────────────────────────────────────────────────

const RPC_ERROR_MESSAGES: Record<string, string> = {
  not_authenticated: "Ta session a expiré. Reconnecte-toi.",
  invalid_input: "Cette séance n'a pas pu être lue. Recharge la page puis réessaie.",
  stale_duo: STALE_DUO_MESSAGE,
  no_exercises: "Ajoute au moins un exercice à cette séance",
  exercise_invalid: "Un exercice de la séance est invalide",
  exercise_duplicate: "Un exercice est en double dans la séance",
  exercise_bounds: "Un exercice a des séries, des répétitions ou un repos hors limites",
  reps_order: "Le minimum de répétitions dépasse le maximum",
  exercise_not_in_catalog: "Un exercice de la séance n'existe pas dans ton catalogue",
  seance_not_found: SEANCE_NOT_FOUND,
  share_unreadable: "Impossible de vérifier où est rangée cette séance. Rien n'a été modifié.",
  name_required: "Le nom de la séance est obligatoire",
  name_too_long: `${SEANCE_NAME_MAX_LENGTH} caractères maximum`,
  name_taken: "Ce nom existe déjà dans tes séances",
  seance_not_in_library: "Séance introuvable dans la bibliothèque : réordonnancement annulé.",
  seance_has_history: "Impossible de supprimer cette séance : elle a déjà été réalisée.",
  refused: REFUSED_MESSAGE,
};

/**
 * Message en français pour l'erreur d'une RPC de séance type : codes
 * `cm88:<code>`, codes du duo `cm87:<code>` (set_seance_shared), refus RLS,
 * sinon le message tel quel (comme les server actions remplacées).
 */
export function seanceRpcErrorMessage(
  error: { code?: string | null; message: string; details?: string | null },
  context: { name?: string } = {},
): string {
  const code = /cm88:([a-z_]+)/.exec(error.message ?? "")?.[1];
  if (code) {
    if (code === "name_taken" && context.name) {
      return `« ${context.name} » existe déjà dans tes séances`;
    }
    if (code === "seance_has_history") {
      // Le nombre de séances réalisées arrive dans le détail de l'erreur.
      const n = Number.parseInt(error.details ?? "", 10);
      return seanceHistoryMessage(context.name ?? "cette séance", Number.isFinite(n) && n > 0 ? n : 1);
    }
    const message = RPC_ERROR_MESSAGES[code];
    if (message) return message;
  }
  if (duoErrorCode(error.message)) return duoErrorMessage(error.message);
  return writeErrorMessage(error);
}

/** Une exception (réseau coupé) devient un échec affichable, jamais une page blanche. */
function thrownMessage(e: unknown): string {
  return e instanceof Error ? e.message : "Une erreur est survenue. Réessaie dans un instant.";
}

/**
 * Bornes et doublons des exercices, avant l'appel : mêmes messages que
 * l'ancienne server action (avec le nom de l'exercice). La RPC refait ces
 * contrôles et c'est elle qui fait foi.
 */
export function validateSeanceExercises(exercises: SeanceDraftExercise[]): SeanceWriteResult {
  if (exercises.length === 0) {
    return { ok: false, error: "Ajoute au moins un exercice à cette séance" };
  }

  const { sets, reps, rest } = SEANCE_DRAFT_LIMITS;
  const seen = new Set<string>();
  const inBounds = (value: number, min: number, max: number) =>
    Number.isInteger(value) && value >= min && value <= max;

  for (const ex of exercises) {
    const id = ex.exerciseId?.trim();
    if (!id) {
      return { ok: false, error: "Un exercice de la séance est invalide" };
    }
    if (seen.has(id)) {
      return { ok: false, error: `« ${ex.name} » est en double dans la séance` };
    }
    seen.add(id);

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
  return { ok: true };
}

export type SaveSeanceInput = {
  /** Absent = création. */
  dayId?: string;
  /** Déjà validé par l'éditeur (`validateSeanceName`) ; la RPC revalide. */
  name: string;
  exercises: SeanceDraftExercise[];
  /**
   * CM-87, en duo seulement (refusé sinon : page périmée) : « Pour nous
   * deux » (`duo`) ou « Pour moi » (`perso`). En création, choisit la
   * bibliothèque (défaut : `duo`). En édition, avec `initialTarget` : seul un
   * CHANGEMENT du choix affiché déplace la séance (C2).
   */
  target?: SeanceTarget;
  /** Édition : choix affiché à l'ouverture de l'écran. */
  initialTarget?: SeanceTarget;
};

export type SaveSeanceResult =
  | {
      ok: true;
      dayId: string;
      programId: string;
      /** Message à afficher dans la bibliothèque (copie au lieu d'un déplacement). */
      notice?: string;
    }
  | { ok: false; error: string };

/**
 * Crée ou met à jour une séance type et TOUS ses exercices, en un seul appel
 * atomique (`save_seance`) : programme créé en silence au besoin, choix
 * « Pour qui ? », copie au lieu d'un déplacement (C1), exercices perso
 * passés au duo. Rien n'est écrit si une étape échoue.
 */
export async function saveSeance(
  supabase: BrowserSupabase,
  input: SaveSeanceInput,
): Promise<SaveSeanceResult> {
  const checked = validateSeanceExercises(input.exercises);
  if (!checked.ok) return checked;

  try {
    const { data, error } = await supabase.rpc("save_seance", {
      p_day_id: input.dayId?.trim() || null,
      p_name: input.name,
      p_exercises: input.exercises.map((ex) => ({
        exercise_id: ex.exerciseId,
        target_sets: ex.targetSets,
        target_reps_min: ex.targetRepsMin,
        target_reps_max: ex.targetRepsMax,
        rest_seconds: ex.restSeconds,
      })),
      p_target: input.target ?? null,
      p_initial_target: input.initialTarget ?? null,
    });
    if (error) {
      return { ok: false, error: seanceRpcErrorMessage(error, { name: input.name.trim() }) };
    }
    const row = data?.[0];
    if (!row) return { ok: false, error: "Impossible d'enregistrer la séance" };
    return {
      ok: true,
      dayId: row.day_id,
      programId: row.program_id,
      notice: row.copied ? SEANCE_COPIED_NOTICE : undefined,
    };
  } catch (e) {
    return { ok: false, error: thrownMessage(e) };
  }
}

/**
 * Duplique une séance et TOUS ses exercices (séries, reps, repos, ordre), en
 * fin de bibliothèque (`duplicate_seance`, atomique : jamais de copie vide).
 */
export async function duplicateSeance(
  supabase: BrowserSupabase,
  dayId: string,
): Promise<SeanceWriteResult> {
  try {
    const { error } = await supabase.rpc("duplicate_seance", { p_day_id: dayId });
    return error ? { ok: false, error: seanceRpcErrorMessage(error) } : { ok: true };
  } catch (e) {
    return { ok: false, error: thrownMessage(e) };
  }
}

/**
 * Monte ou descend une séance dans la bibliothèque (`move_seance`, atomique :
 * toute la bibliothèque est renumérotée 0..n-1 d'un coup). Déjà en butée :
 * rien à faire, ce n'est pas une erreur.
 */
export async function moveSeance(
  supabase: BrowserSupabase,
  dayId: string,
  direction: "up" | "down",
): Promise<SeanceWriteResult> {
  try {
    const { error } = await supabase.rpc("move_seance", {
      p_day_id: dayId,
      p_direction: direction,
    });
    return error ? { ok: false, error: seanceRpcErrorMessage(error) } : { ok: true };
  } catch (e) {
    return { ok: false, error: thrownMessage(e) };
  }
}

/**
 * CM-104 : message quand le nom est déjà pris dans « Nos séances ». La RPC
 * refuse avant tout changement : rien n'a bougé, on renvoie vers Modifier.
 */
export function shareNameTakenMessage(name: string): string {
  return (
    `« ${name} » existe déjà dans « Nos séances ». Rien n'a été modifié : ` +
    "renomme-la avec « Modifier », puis partage-la."
  );
}

/**
 * CM-104 : raccourci « Partager avec … » de la bibliothèque. Même RPC que le
 * choix « Pour qui ? » de l'écran Modifier (`set_seance_shared`, atomique,
 * relit l'état réel sous verrou) : la séance perso passe dans « Nos
 * séances ». Déjà partagée (`unchanged`) : rien à faire, ce n'est pas une
 * erreur, la bibliothèque relue l'affiche à sa vraie place.
 */
export async function shareSeance(
  supabase: BrowserSupabase,
  dayId: string,
  name: string,
): Promise<SeanceWriteResult> {
  try {
    const { error } = await supabase.rpc("set_seance_shared", {
      p_day_id: dayId,
      p_shared: true,
    });
    if (!error) return { ok: true };
    const code = duoErrorCode(error.message);
    if (code === "name_taken") {
      return { ok: false, error: shareNameTakenMessage(name) };
    }
    // Le partenaire a quitté le duo depuis l'affichage : écran périmé
    // (`useSeanceLibraryAction` relit alors tout le profil).
    if (code === "no_partner" || code === "not_in_duo") {
      return { ok: false, error: STALE_DUO_MESSAGE };
    }
    return { ok: false, error: seanceRpcErrorMessage(error, { name }) };
  } catch (e) {
    return { ok: false, error: thrownMessage(e) };
  }
}

/**
 * Message du refus de suppression d'une séance type déjà réalisée (`n`
 * séances terminées avec séries, partenaire compris).
 */
export function seanceHistoryMessage(name: string, n: number): string {
  return (
    `Impossible de supprimer « ${name} » : ${n} séance${n > 1 ? "s" : ""} ` +
    `déjà réalisée${n > 1 ? "s" : ""} y ${n > 1 ? "sont rattachées" : "est rattachée"}. ` +
    "La supprimer détacherait cet historique. Renomme-la ou vide-la de ses exercices."
  );
}

/**
 * Supprime une séance type (`delete_seance`, atomique).
 *
 * `sessions.program_day_id` est en ON DELETE SET NULL : supprimer une séance
 * déjà réalisée ne supprimerait pas l'historique mais le détacherait en
 * silence (les séances passées perdraient leur nom). La RPC refuse donc la
 * suppression dès qu'au moins une séance terminée avec des séries y est
 * rattachée, dans la même transaction que la suppression. Les séances vides
 * ou en cours ne bloquent pas. `name` : nom affiché, repris dans le message.
 */
export async function deleteSeance(
  supabase: BrowserSupabase,
  dayId: string,
  name: string,
): Promise<SeanceWriteResult> {
  try {
    const { error } = await supabase.rpc("delete_seance", { p_day_id: dayId });
    return error ? { ok: false, error: seanceRpcErrorMessage(error, { name }) } : { ok: true };
  } catch (e) {
    return { ok: false, error: thrownMessage(e) };
  }
}
