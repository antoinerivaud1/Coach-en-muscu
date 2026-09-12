import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { completedSessionsQuery } from "@/lib/queries/sessions";

export async function getProgramsForUser(
  supabase: SupabaseClient<Database>,
  profileId: string,
  coupleId: string | null,
) {
  const query = supabase
    .from("programs")
    .select("id, name, couple_id, owner_profile_id, created_at, program_days(id)")
    .order("created_at", { ascending: false });

  if (coupleId) {
    return query.or(
      `owner_profile_id.eq.${profileId},couple_id.eq.${coupleId}`,
    );
  }

  return query.eq("owner_profile_id", profileId);
}

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

export type ProgramWithDays = {
  id: string;
  name: string;
  couple_id: string | null;
  owner_profile_id: string | null;
  created_at: string;
  program_days: { id: string }[];
};

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

export async function getDayWithExercises(
  supabase: SupabaseClient<Database>,
  dayId: string,
) {
  return supabase
    .from("program_days")
    .select(
      `id, name, order_index,
       program_exercises (
         id, exercise_id, target_sets, target_reps_min, target_reps_max,
         rest_seconds, order_index,
         exercises ( id, name, muscle_group )
       )`,
    )
    .eq("id", dayId)
    .returns<ProgramDayFull[]>()
    .maybeSingle();
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

// ---- Renommage d'une séance type (CM-80) ----

/**
 * Renomme une séance type.
 *
 * L'historique n'est pas touché : les `sessions` pointent sur
 * `program_day_id`, le nouveau nom se propage donc partout (accueil, détail
 * d'une séance passée, historique) sans autre écriture.
 *
 * La validation du nom (non vide, longueur, unicité dans le programme) est
 * faite en amont par `validateSeanceName` : cette requête ne fait qu'écrire.
 */
export async function renameProgramDay(
  supabase: SupabaseClient<Database>,
  dayId: string,
  name: string,
) {
  return supabase.from("program_days").update({ name }).eq("id", dayId);
}
