import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getProfile } from "@/lib/profile";
import { getDuoState } from "@/lib/queries/duo";
import { formatInviteExpiry } from "@/lib/duo";
import DuoScreen from "@/components/duo/DuoScreen";
import ShareInvitation from "@/components/duo/ShareInvitation";
import { RevokeInvitationButton } from "@/components/duo/InvitationForms";

export const metadata: Metadata = { title: "Inviter ton partenaire · Coach en Muscu" };

const PERKS = [
  "Une bibliothèque de séances commune",
  "Chacun voit les séances et les records de l’autre",
  "Un comparatif de vos semaines dans Stats",
];

/**
 * CM-87 : invitation créée (maquette 7). Code, partage du lien ou copie du
 * code, statut « en attente », annulation. Sans invitation en attente (déjà
 * acceptée, annulée, expirée), retour au Profil.
 */
export default async function InviterPage() {
  const profileId = await requireProfileId("/duo/inviter");
  const supabase = await createClient();
  const state = await getDuoState(supabase, profileId);
  if (state.kind !== "pending") redirect("/profile");
  const me = await getProfile(supabase, profileId);
  const { code, expiresAt } = state.invitation;

  return (
    <DuoScreen
      backHref="/profile"
      backLabel="Fermer"
      icon="close"
      footer={<RevokeInvitationButton />}
    >
      <h1 className="mt-[18px] text-balance text-[30px] font-black leading-tight tracking-tight text-fg">
        Invite ton partenaire
      </h1>
      <p className="mt-2 text-balance text-[17px] leading-snug text-fg-muted">
        Envoie-lui le lien. Il peut aussi saisir le code depuis son profil.
      </p>

      <div className="mt-6 flex flex-col items-center gap-4 rounded-3xl border border-line bg-surface p-[18px]">
        <span className="text-sm font-extrabold uppercase tracking-[0.1em] text-fg-muted">
          Code d&apos;invitation
        </span>
        <div
          className="grid w-full grid-cols-6 gap-2"
          role="group"
          aria-label={`Code d'invitation ${[...code].join(" ")}`}
          data-testid="invite-code"
          data-code={code}
        >
          {[...code].map((c, i) => (
            <span
              key={i}
              aria-hidden
              className="flex h-[52px] items-center justify-center rounded-[14px] bg-surface2 font-oswald text-[32px] font-bold text-energy"
            >
              {c}
            </span>
          ))}
        </div>
        <span className="text-[15px] text-fg-muted">
          Valable 7&nbsp;jours, jusqu&apos;au {formatInviteExpiry(expiresAt)}
        </span>
      </div>

      <ShareInvitation code={code} inviterName={me?.display_name ?? ""} />

      <div className="mt-1.5 flex items-center gap-3 rounded-[18px] border border-energy/20 bg-energy/[0.06] px-4 py-3.5">
        <span
          className="h-2.5 w-2.5 flex-none rounded-full bg-energy shadow-[0_0_0_5px_rgba(204,255,2,0.18)]"
          aria-hidden
        />
        <span className="text-balance text-base leading-snug text-[#E4E4EA]">
          En attente. Tu verras ton duo ici dès qu&apos;il aura accepté.
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-3">
        <h2 className="text-[15px] font-bold uppercase tracking-[0.06em] text-fg-muted">En duo</h2>
        <ul className="flex flex-col gap-3">
          {PERKS.map((p) => (
            <li key={p} className="flex items-start gap-2.5">
              <svg viewBox="0 0 24 24" fill="none" stroke="#CCFF02" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-[18px] w-[18px] flex-none" aria-hidden>
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span className="text-base leading-snug text-[#C9C9D1]">{p}</span>
            </li>
          ))}
        </ul>
      </div>
    </DuoScreen>
  );
}
