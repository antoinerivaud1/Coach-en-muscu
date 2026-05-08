import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

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

export type ProgramWithDays = {
  id: string;
  name: string;
  couple_id: string | null;
  owner_profile_id: string | null;
  created_at: string;
  program_days: { id: string }[];
};
