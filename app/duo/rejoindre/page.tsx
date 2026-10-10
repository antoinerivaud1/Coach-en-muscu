import type { Metadata } from "next";
import { requireProfileId } from "@/lib/profile";
import { duoErrorMessage, normalizeInviteCode } from "@/lib/duo";
import DuoScreen from "@/components/duo/DuoScreen";
import JoinCodeForm from "@/components/duo/JoinCodeForm";

export const metadata: Metadata = { title: "Rejoindre un duo · Coach en Muscu" };

/**
 * CM-87 : rejoindre avec un code (maquette 8). Le lien d'invitation
 * `/duo/rejoindre?code=XXXXXX` pré-remplit le code ; sans session, il passe
 * par `/login?next=…` et revient ici. `erreur` : code d'erreur renvoyé par
 * l'écran de confirmation.
 */
export default async function RejoindrePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; erreur?: string }>;
}) {
  const { code: rawCode, erreur } = await searchParams;
  const code = normalizeInviteCode(rawCode);
  await requireProfileId(code ? `/duo/rejoindre?code=${code}` : "/duo/rejoindre");

  return (
    <DuoScreen backHref="/profile" backLabel="Retour" icon="back">
      <h1 className="mt-6 text-balance text-[30px] font-black leading-tight tracking-tight text-fg">
        Rejoins un duo
      </h1>
      <p className="mt-2 text-balance text-[17px] leading-snug text-fg-muted">
        Saisis le code à 6&nbsp;caractères reçu de ton partenaire.
      </p>
      <JoinCodeForm
        initialCode={code}
        error={erreur ? duoErrorMessage(`cm87:${erreur}`) : null}
      />
    </DuoScreen>
  );
}
