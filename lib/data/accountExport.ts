import type { BrowserSupabase } from "@/lib/supabase/client";
import { readAccountExport } from "@/lib/queries/accountExport";
import { buildExportZip } from "@/lib/export/accountExport";

/**
 * CM-88 : export des données construit dans le navigateur (remplace la route
 * `/profile/export`). Lecture sous RLS avec le client navigateur, filtrée
 * explicitement sur le compte connecté (lib/queries/accountExport.ts), puis
 * archive ZIP pure (`buildExportZip`). Lève si une lecture échoue.
 */

/** Email du compte, lu dans les claims du JWT ; null s'il est illisible. */
async function readClaimsEmail(supabase: BrowserSupabase): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const email = data?.claims?.email;
    return typeof email === "string" && email ? email : null;
  } catch {
    return null;
  }
}

export async function buildAccountExportZip(
  supabase: BrowserSupabase,
  profileId: string,
  now: Date,
): Promise<Uint8Array<ArrayBuffer>> {
  const data = await readAccountExport(supabase, profileId, await readClaimsEmail(supabase));
  return buildExportZip(data, now);
}
