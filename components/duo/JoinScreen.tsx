"use client";

import { useSearchParams } from "next/navigation";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { duoErrorMessage, normalizeInviteCode } from "@/lib/duo";
import DuoScreen from "@/components/duo/DuoScreen";
import JoinCodeForm from "@/components/duo/JoinCodeForm";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";

/**
 * CM-87 : rejoindre avec un code (maquette 8). Le lien d'invitation
 * `/duo/rejoindre?code=XXXXXX` pré-remplit le code ; sans session, il passe
 * par `/login?next=…` et revient ici. `erreur` : code d'erreur renvoyé par
 * l'écran de confirmation.
 *
 * CM-88 (PR 7) : `code` et `erreur` lus dans l'URL côté navigateur (sous
 * `<Suspense>`, la route reste statique), session vérifiée dans le
 * navigateur.
 */
export default function JoinScreen() {
  const params = useSearchParams();
  const code = normalizeInviteCode(params.get("code"));
  const erreur = params.get("erreur");
  const auth = useRequireProfileId(code ? `/duo/rejoindre?code=${code}` : "/duo/rejoindre");

  return (
    <DuoScreen backHref="/profile" backLabel="Retour" icon="back">
      {auth.error && !auth.profileId ? (
        <div className="mt-6">
          <ScreenError onRetry={() => void auth.refetch()} />
        </div>
      ) : auth.isPending ? (
        <div className="mt-6">
          <ScreenSkeleton label="Chargement" rows={3} />
        </div>
      ) : (
        <>
          <h1 className="mt-6 text-balance text-[30px] font-black leading-tight tracking-tight text-fg">
            Rejoins un duo
          </h1>
          <p className="mt-2 text-balance text-[17px] leading-snug text-fg-muted">
            Saisis le code à 6&nbsp;caractères reçu de ton partenaire.
          </p>
          <JoinCodeForm
            // Nouvelle URL (retour de la confirmation) : saisie réinitialisée.
            key={`${code}:${erreur ?? ""}`}
            initialCode={code}
            error={erreur ? duoErrorMessage(`cm87:${erreur}`) : null}
          />
        </>
      )}
    </DuoScreen>
  );
}
