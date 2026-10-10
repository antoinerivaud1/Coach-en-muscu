import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getProfile } from "@/lib/profile";
import { previewInvitation } from "@/lib/queries/duo";
import { duoErrorCode, isValidInviteCode, normalizeInviteCode } from "@/lib/duo";
import DuoScreen from "@/components/duo/DuoScreen";
import ConfirmJoinForm from "@/components/duo/ConfirmJoinForm";

export const metadata: Metadata = { title: "Confirmer le duo · Coach en Muscu" };

/**
 * CM-87 : confirmation avant de rejoindre (maquette 9). Code invalide,
 * expiré, déjà utilisé ou le sien : retour à la saisie avec le message.
 */
export default async function ConfirmerPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const code = normalizeInviteCode((await searchParams).code);
  const profileId = await requireProfileId(
    code ? `/duo/rejoindre/confirmer?code=${code}` : "/duo/rejoindre",
  );
  if (!isValidInviteCode(code)) redirect("/duo/rejoindre?erreur=invitation_invalid");

  const preview = await previewInvitation(code);
  if (!preview.ok) {
    const err = duoErrorCode(preview.error) ?? "invitation_invalid";
    redirect(`/duo/rejoindre?code=${code}&erreur=${err}`);
  }
  if (preview.preview.alreadyInDuo) {
    redirect(`/duo/rejoindre?code=${code}&erreur=already_in_duo`);
  }

  const supabase = await createClient();
  const me = await getProfile(supabase, profileId);
  const p = preview.preview;

  return (
    <DuoScreen backHref={`/duo/rejoindre?code=${code}`} backLabel="Retour" icon="back">
      <ConfirmJoinForm
        code={code}
        inviterName={p.inviterName}
        inviterColor={p.inviterColor}
        myName={me?.display_name ?? ""}
        myColor={p.myColor}
        colorConflict={p.colorConflict}
      />
    </DuoScreen>
  );
}
