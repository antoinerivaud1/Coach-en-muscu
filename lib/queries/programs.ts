import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { completedSessionsQuery } from "@/lib/queries/sessions";
import { writeErrorMessage } from "@/lib/supabase/rlsErrors";
import { seanceDestination, type SeanceTarget } from "@/lib/duo";
import type { LibraryTarget } from "@/lib/duoMembership";

/**
 * Id du programme partagé du couple (CM-80).
 *
 * Un programme partagé a `duo_id` renseigné et `owner_profile_id` à null :
 * la contrainte `programs_owner_xor_duo` garantit que les deux sont exclusifs
 * (CM-99). Il n'y en a qu'un en pratique ; s'il y en avait plusieurs, on
 * retient le plus ancien pour que l'accueil et le Profil pointent toujours au
 * même endroit.
 */
export async function getSharedProgramId(
  supabase: SupabaseClient<Database>,
  duoId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("programs")
    .select("id")
    .eq("duo_id", duoId)
    .is("owner_profile_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .returns<{ id: string }[]>();

  return data?.[0]?.id ?? null;
}

export type ProgramAccess =
  | { ok: true; allowed: boolean }
  | { ok: false; error: string };

/**
 * Le profil courant a-t-il le droit d'agir sur ce programme ?
 *
 * CM-59 B : la RLS (client utilisateur) garantit déjà le périmètre ; ce
 * contrôle reste en place (ceinture et bretelles, et filet
 * `DATA_CLIENT=service` où la RLS est contournée). Une server action qui reçoit
 * un id arbitraire vérifie donc toujours à qui appartient la ligne visée.
 *
 * Accès accordé si le programme est personnel et appartient au profil, ou s'il
 * est partagé et que le profil est membre de ce couple. `allowed: false`
 * couvre aussi le programme inexistant : l'appelant ne doit pas distinguer les
 * deux cas dans son message.
 *
 * `ok: false` = la vérification n'a pas pu aboutir ; l'appelant refuse
 * l'action plutôt que de l'autoriser par défaut.
 */
export async function canAccessProgram(
  supabase: SupabaseClient<Database>,
  programId: string,
  profileId: string,
): Promise<ProgramAccess> {
  const { data: program, error } = await supabase
    .from("programs")
    .select("id, owner_profile_id, duo_id")
    .eq("id", programId)
    .returns<
      { id: string; owner_profile_id: string | null; duo_id: string | null }[]
    >()
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message };
  }
  if (!program) {
    return { ok: true, allowed: false };
  }
  if (program.owner_profile_id === profileId) {
    return { ok: true, allowed: true };
  }
  if (!program.duo_id) {
    return { ok: true, allowed: false };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("duo_members")
    .select("duo_id")
    .eq("duo_id", program.duo_id)
    .eq("profile_id", profileId)
    .returns<{ duo_id: string }[]>()
    .maybeSingle();

  if (membershipError) {
    return { ok: false, error: membershipError.message };
  }

  return { ok: true, allowed: Boolean(membership) };
}

// ---- Détail complet d'une bibliothèque (séances types + exos) ----
// `program_days` = une séance type. Le schéma garde son nom (CM-65) ; seul le
// vocabulaire de l'UI parle de « séance ».

export type ProgramExerciseFull = {
  id: string;
  exercise_id: string;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  order_index: number;
  exercises: {
    id: string;
    name: string;
    muscle_group: Database["public"]["Enums"]["muscle_group"];
  } | null;
};

export type ProgramDayFull = {
  id: string;
  name: string;
  order_index: number;
  program_exercises: ProgramExerciseFull[];
};

export type ProgramFull = {
  id: string;
  name: string;
  duo_id: string | null;
  owner_profile_id: string | null;
  program_days: ProgramDayFull[];
};

export async function getProgramWithDays(
  supabase: SupabaseClient<Database>,
  programId: string,
) {
  return supabase
    .from("programs")
    .select(
      `id, name, duo_id, owner_profile_id,
       program_days (
         id, name, order_index,
         program_exercises (
           id, exercise_id, target_sets, target_reps_min, target_reps_max,
           rest_seconds, order_index,
           exercises ( id, name, muscle_group )
         )
       )`,
    )
    .eq("id", programId)
    .returns<ProgramFull[]>()
    .maybeSingle();
}

// ---- Une séance type précise avec ses exercices (pour la démarrer) ----

/**
 * Une séance chargée seule, hors de son programme, porte en plus son
 * `program_id` : sans lui, une server action qui reçoit un `dayId` ne pourrait
 * pas appeler `canAccessProgram` (CM-81). Reste assignable à `ProgramDayFull`
 * pour les appelants qui l'ignorent.
 */
export type ProgramDayWithProgram = ProgramDayFull & { program_id: string };

export async function getDayWithExercises(
  supabase: SupabaseClient<Database>,
  dayId: string,
) {
  return supabase
    .from("program_days")
    .select(
      `id, name, order_index, program_id,
       program_exercises (
         id, exercise_id, target_sets, target_reps_min, target_reps_max,
         rest_seconds, order_index,
         exercises ( id, name, muscle_group )
       )`,
    )
    .eq("id", dayId)
    .returns<ProgramDayWithProgram[]>()
    .maybeSingle();
}

/** Noms des séances d'un programme, avec leur id (unicité du nom, CM-81). */
export async function getProgramDayNames(
  supabase: SupabaseClient<Database>,
  programId: string,
): Promise<{ ok: true; days: { id: string; name: string }[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("program_days")
    .select("id, name")
    .eq("program_id", programId)
    .returns<{ id: string; name: string }[]>();

  if (error) return { ok: false, error: error.message };
  return { ok: true, days: data ?? [] };
}

// ---- Écriture : programme partagé et ordre des séances ----

export type OrderIndexResult =
  | { ok: true; value: number }
  | { ok: false; error: string };

/**
 * `order_index` à donner à une nouvelle séance : max existant + 1.
 *
 * CM-70 : l'erreur est remontée. Elle était avalée et la fonction renvoyait
 * `0`, ce qui plaçait la nouvelle séance en doublon d'ordre en tête de liste.
 */
export async function nextOrderIndex(
  supabase: SupabaseClient<Database>,
  programId: string,
): Promise<OrderIndexResult> {
  const { data, error } = await supabase
    .from("program_days")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1)
    .returns<{ order_index: number }[]>();

  if (error) {
    return { ok: false, error: error.message };
  }

  const max = data?.[0]?.order_index;
  return { ok: true, value: typeof max === "number" ? max + 1 : 0 };
}

/** Nom du programme partagé, jamais montré à l'utilisateur (CM-81). */
export const SHARED_PROGRAM_NAME = "Nos séances";

export type EnsureSharedProgram =
  | { ok: true; programId: string }
  | { ok: false; error: string };

/**
 * Id du programme partagé du couple, créé à la volée s'il n'existe pas encore
 * (CM-81).
 *
 * La notion de programme a disparu de l'UI : Antoine et Léa n'ont qu'une
 * bibliothèque de séances. Le schéma, lui, exige toujours un `programs` parent
 * (`program_days.program_id` est NOT NULL), d'où cette ligne unique créée en
 * silence à la première séance puis toujours réutilisée.
 *
 * Seule fonction de ce module qui écrit : elle est ici pour que l'appel reste
 * un « donne-moi l'id du programme partagé » côté action, et pour qu'il n'y
 * ait qu'un seul endroit capable de créer ce programme.
 */
export async function ensureSharedProgram(
  supabase: SupabaseClient<Database>,
  duoId: string,
): Promise<EnsureSharedProgram> {
  const existing = await getSharedProgramId(supabase, duoId);
  if (existing) return { ok: true, programId: existing };

  const { data, error } = await supabase
    .from("programs")
    .insert({
      name: SHARED_PROGRAM_NAME,
      duo_id: duoId,
      owner_profile_id: null,
    })
    .select("id")
    .returns<{ id: string }[]>()
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error
        ? writeErrorMessage(error)
        : "Impossible de créer la bibliothèque du couple",
    };
  }

  return { ok: true, programId: data.id };
}

/** Nom du programme perso, jamais montré à l'utilisateur (CM-86). */
export const PERSONAL_PROGRAM_NAME = "Mes séances";

export type PersonalProgramRead =
  | { ok: true; programId: string | null }
  | { ok: false; error: string };

/**
 * Programme PERSO du profil (`owner_profile_id` = lui, `duo_id` null), le plus
 * ancien s'il y en a plusieurs (CM-86). Distingue « aucun » d'une erreur.
 */
export async function readPersonalProgramId(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<PersonalProgramRead> {
  try {
    const { data, error } = await supabase
      .from("programs")
      .select("id")
      .eq("owner_profile_id", profileId)
      .is("duo_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .returns<{ id: string }[]>();
    if (error) return { ok: false, error: error.message };
    return { ok: true, programId: data?.[0]?.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lecture impossible" };
  }
}

/**
 * Id du programme perso, null s'il n'existe pas ENCORE ou si la lecture
 * échoue (affichage uniquement ; pour écrire : `ensurePersonalProgram`).
 */
export async function getPersonalProgramId(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<string | null> {
  const read = await readPersonalProgramId(supabase, profileId);
  return read.ok ? read.programId : null;
}

/**
 * Équivalent perso d'`ensureSharedProgram` (CM-86) : la bibliothèque d'un
 * utilisateur qui s'entraîne seul vit dans un programme à son nom, créé
 * paresseusement à la PREMIÈRE ÉCRITURE (jamais au simple affichage d'une
 * page) puis toujours réutilisé. Il reste à lui s'il rejoint un duo plus tard.
 *
 * Lecture en échec : refus, jamais de création « à l'aveugle » (sinon un
 * doublon de programme à chaque coupure réseau).
 */
export async function ensurePersonalProgram(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<EnsureSharedProgram> {
  const existing = await readPersonalProgramId(supabase, profileId);
  if (!existing.ok) {
    return { ok: false, error: `Impossible de lire ta bibliothèque (${existing.error})` };
  }
  if (existing.programId) return { ok: true, programId: existing.programId };

  const { data, error } = await supabase
    .from("programs")
    .insert({
      name: PERSONAL_PROGRAM_NAME,
      owner_profile_id: profileId,
      duo_id: null,
    })
    .select("id")
    .returns<{ id: string }[]>()
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error ? writeErrorMessage(error) : "Impossible de créer ta bibliothèque",
    };
  }

  return { ok: true, programId: data.id };
}

/**
 * CM-87 : bibliothèque où va une NOUVELLE séance type. Fonction partagée par
 * la création de séance, par-dessus `ensureSharedProgram` /
 * `ensurePersonalProgram` (CM-86). `library` vient TOUJOURS de
 * `libraryTarget(await readDuoId(…))` : une lecture du duo en échec est un
 * refus, jamais un repli en perso (`seanceDestination`, lib/duo.ts).
 */
export async function resolveTargetProgram(
  supabase: SupabaseClient<Database>,
  input: {
    profileId: string;
    library: LibraryTarget;
    target?: SeanceTarget | null;
  },
): Promise<EnsureSharedProgram & { target?: SeanceTarget }> {
  const dest = seanceDestination(input.library, input.target);
  if (!dest.ok) return { ok: false, error: dest.error };
  const result =
    dest.target === "duo" && input.library.kind === "shared"
      ? await ensureSharedProgram(supabase, input.library.duoId)
      : await ensurePersonalProgram(supabase, input.profileId);
  return result.ok ? { ...result, target: dest.target } : result;
}

// ---- Historique rattaché à une séance type ----

export type LoggedSessionCount =
  | { ok: true; count: number }
  | { ok: false; error: string };

/**
 * Nombre de séances RÉELLEMENT réalisées sur cette séance type, c.-à-d. les
 * `sessions` TERMINÉES qui ont au moins une ligne dans `session_sets`.
 *
 * Les sessions vides (démarrées puis abandonnées sans aucune série) ne comptent
 * pas : un décompte naïf sur `sessions` donnerait des chiffres faux (CM-65).
 * Depuis CM-83 les séances en cours ne comptent pas non plus : elles ont des
 * séries dès le premier « Valider » (CM-78), le compteur bougeait donc pendant
 * la séance et le garde-fou de `deleteSeance` s'armait avant qu'elle soit finie.
 *
 * CM-70 : l'erreur est remontée au lieu d'être avalée. Auparavant un échec de
 * cette requête renvoyait `0`, ce qui désarmait silencieusement le garde-fou
 * d'historique de `deleteSeance` et détachait les séances déjà réalisées.
 */
export async function countLoggedSessionsForDay(
  supabase: SupabaseClient<Database>,
  dayId: string,
): Promise<LoggedSessionCount> {
  const { data, error } = await completedSessionsQuery(
    supabase,
    "id, session_sets(id)",
  )
    .eq("program_day_id", dayId)
    .returns<{ id: string; session_sets: { id: string }[] }[]>();

  if (error) {
    return { ok: false, error: error.message };
  }

  return {
    ok: true,
    count: (data ?? []).filter((s) => (s.session_sets ?? []).length > 0).length,
  };
}
