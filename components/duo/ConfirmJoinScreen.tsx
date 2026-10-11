"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useIdentity } from "@/hooks/data/useIdentity";
import { useInvitationPreview } from "@/hooks/data/useInvitationPreview";
import { isValidInviteCode, normalizeInviteCode } from "@/lib/duo";
import DuoScreen from "@/components/duo/DuoScreen";
import ConfirmJoinForm from "@/components/duo/ConfirmJoinForm";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";

/**
 * CM-87 : confirmation avant de rejoindre (maquette 9). Code invalide,
 * expiré, déjà utilisé ou le sien : retour à la saisie avec le message.
 *
 * CM-88 (PR 7) : `code` lu dans l'URL côté navigateur, aperçu de
 * l'invitation (RPC `get_duo_invitation`) et prénom lus dans le navigateur.
 * Une erreur réseau n'est PAS un code faux : « Réessayer », sans retour à la
 * saisie.
 */
export default function ConfirmJoinScreen() {
  const router = useRouter();
  const code = normalizeInviteCode(useSearchParams().get("code"));
  const valid = isValidInviteCode(code);
  const auth = useRequireProfileId(
    code ? `/duo/rejoindre/confirmer?code=${code}` : "/duo/rejoindre",
  );
  const profileId = auth.profileId;
  const preview = useInvitationPreview(profileId, valid ? code : "");
  const identity = useIdentity(profileId);

  // Où renvoyer vers la saisie du code, avec quel message (null : on reste).
  const read = preview.data;
  let back: string | null = null;
  if (profileId && !valid) back = "/duo/rejoindre?erreur=invitation_invalid";
  else if (read && !read.ok) back = `/duo/rejoindre?code=${code}&erreur=${read.code}`;
  else if (read?.ok && read.preview.alreadyInDuo) {
    back = `/duo/rejoindre?code=${code}&erreur=already_in_duo`;
  }

  useEffect(() => {
    if (back) router.replace(back);
  }, [back, router]);

  const frame = (children: React.ReactNode) => (
    <DuoScreen backHref={`/duo/rejoindre?code=${code}`} backLabel="Retour" icon="back">
      {children}
    </DuoScreen>
  );

  if (auth.error && !profileId) {
    return frame(
      <div className="mt-6">
        <ScreenError onRetry={() => void auth.refetch()} />
      </div>,
    );
  }
  if (preview.error) {
    return frame(
      <div className="mt-6">
        <ScreenError onRetry={() => void preview.refetch()} />
      </div>,
    );
  }
  if (back || !read?.ok || identity.isPending) {
    return frame(
      <div className="mt-6">
        <ScreenSkeleton label="Chargement de l'invitation" rows={4} />
      </div>,
    );
  }

  const p = read.preview;
  return frame(
    <ConfirmJoinForm
      code={code}
      inviterName={p.inviterName}
      inviterColor={p.inviterColor}
      // Prénom illisible : vide, comme avant (`me?.display_name ?? ""`).
      myName={identity.data?.display_name ?? ""}
      myColor={p.myColor}
      colorConflict={p.colorConflict}
    />,
  );
}
