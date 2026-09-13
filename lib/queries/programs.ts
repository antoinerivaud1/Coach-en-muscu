import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { completedSessionsQuery } from "@/lib/queries/sessions";

/**
 * Id du programme partagé du couple (CM-80).
 *
 * Un programme partagé a `couple_id` renseigné et `owner_profile_id` à null —
 * la contrainte `program_owner_xor` garantit que les deux sont exclusifs. Il
 * n'y en a qu'un en pratique ; s'il y en avait plusieurs, on retient le plus
 * ancien pour que l'accueil et le Profil pointent toujours au même endroit.
 */
export async function getSharedProgramId(
  supabase: SupabaseClient<Database>,
  coupleId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("programs")
    .select("id")
    .eq("couple_id", coupleId)
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
 * Le client serveur utilise la clé `service_role` et contourne donc la RLS
 * (cf. `lib/supabase/server.ts`, CM-17) : `auth.uid()` est toujours null,
 * l'app identifie le profil par cookie. Le périmètre des données est garanti
 * par le code, pas par la base — une server action qui reçoit un id arbitraire
 * doit donc vérifier elle-même à qui appartient la ligne visée.
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
    .select("id, owner_profile_id, couple_id")
    .eq("id", programId)
    .returns<
      { id: string; owner_profile_id: string | null; couple_id: string | null }[]
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
  if (!program.couple_id) {
    return { ok: true, allowed: false };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("couple_members")
    .select("couple_id")
    .eq("couple_id", program.couple_id)
    .eq("profile_id", profileId)
    .returns<{ couple_id: string }[]>()
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
  couple_id: string | null;
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
      `id, name, couple_id, owner_profile_id,
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
  coupleId: string,
): Promise<EnsureSharedProgram> {
  const existing = await getSharedProgramId(supabase, coupleId);
  if (existing) return { ok: true, programId: existing };

  const { data, error } = await supabase
    .from("programs")
    .insert({
      name: SHARED_PROGRAM_NAME,
      couple_id: coupleId,
      owner_profile_id: null,
    })
    .select("id")
    .returns<{ id: string }[]>()
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Impossible de créer la bibliothèque du couple",
    };
  }

  return { ok: true, programId: data.id };
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
