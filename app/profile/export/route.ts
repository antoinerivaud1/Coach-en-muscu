import { NextResponse, type NextRequest } from "next/server";
import { loginPath } from "@/lib/auth/core";
import { getCurrentProfileId } from "@/lib/profile";
import { createAuthClient, createClient } from "@/lib/supabase/server";
import { readAccountExport } from "@/lib/queries/accountExport";
import { EXPORT_FAILED, buildExportZip, exportFileBaseName } from "@/lib/export/accountExport";

// CM-60 : « Exporter mes données » (Profil, section « Mes données »).
// Archive ZIP coach-en-muscu-export-AAAA-MM-JJ.zip : le CSV des séances et
// séries (tableur) et le JSON complet (profil, séances types perso, séances,
// séries, exercices perso). Seulement les données du compte connecté
// (lib/queries/accountExport.ts), jamais celles du partenaire.
export const dynamic = "force-dynamic";

async function readEmail(): Promise<string | null> {
  try {
    const { data } = await (await createAuthClient()).auth.getClaims();
    const email = data?.claims?.email;
    return typeof email === "string" && email ? email : null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const profileId = await getCurrentProfileId();
  if (!profileId) {
    return NextResponse.redirect(new URL(loginPath("/profile"), request.url));
  }

  try {
    const supabase = await createClient();
    const data = await readAccountExport(supabase, profileId, await readEmail());
    const now = new Date();
    const zip = buildExportZip(data, now);
    return new NextResponse(zip, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${exportFileBaseName(now)}.zip"`,
        "Content-Length": String(zip.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[CM-60] export impossible :", e instanceof Error ? e.message : e);
    // Retour au profil avec un message : une page d'erreur nue serait une
    // impasse dans la PWA iOS (aucune barre de navigation).
    return NextResponse.redirect(
      new URL(`/profile?export=${EXPORT_FAILED}#mes-donnees`, request.url),
      303,
    );
  }
}
