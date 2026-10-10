import Link from "next/link";
import type { DuoState } from "@/lib/queries/duo";
import { formatInviteExpiry } from "@/lib/duo";
import { memberAccent } from "@/lib/members";
import { DUO_READ_ERROR_MESSAGE } from "@/lib/duoMembership";
import DuoAvatars from "@/components/duo/DuoAvatars";
import { InviteButton, RevokeInvitationButton } from "@/components/duo/InvitationForms";
import LeaveDuoSheet from "@/components/duo/LeaveDuoSheet";

/**
 * CM-87 : carte « S'entraîner à deux » du Profil (maquette 6), selon l'état :
 * - solo : inviter son partenaire, ou saisir un code reçu ;
 * - invitation en attente : code, lien vers l'écran de partage, annulation ;
 * - en duo : partenaire, puis « Quitter le duo » (feuille de confirmation).
 */
export default function DuoSection({
  state,
  me,
}: {
  state: DuoState;
  me: { id: string; name: string; color: string };
}) {
  if (state.kind === "error") {
    return (
      <section
        aria-labelledby="duo-titre"
        className="mt-3 flex flex-col gap-2 rounded-3xl border border-line bg-surface p-5"
      >
        <h2 id="duo-titre" className="text-[21px] font-black text-fg">
          S&apos;entraîner à deux
        </h2>
        <p role="alert" className="text-balance text-base leading-snug text-fg-muted">
          {DUO_READ_ERROR_MESSAGE}
        </p>
        <a href="/profile" className="flex min-h-11 items-center font-bold text-energy">
          Réessayer
        </a>
      </section>
    );
  }

  if (state.kind === "duo") {
    const partner = {
      id: state.partner.id,
      name: state.partner.display_name,
      color: memberAccent(state.partner),
    };
    return (
      <section
        aria-labelledby="duo-titre"
        className="mt-3 flex flex-col gap-3.5 rounded-3xl border border-line bg-surface p-5"
      >
        <div className="flex items-center gap-3.5">
          <DuoAvatars members={[me, partner]} size={44} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 id="duo-titre" className="text-[21px] font-black text-fg">
              Ton duo
            </h2>
            <p className="text-balance text-base leading-snug text-fg-muted">
              Avec <span className="font-bold" style={{ color: partner.color }}>{partner.name}</span>
              , vous partagez «&nbsp;Nos séances&nbsp;».
            </p>
          </div>
        </div>
        <LeaveDuoSheet partnerName={partner.name} />
      </section>
    );
  }

  if (state.kind === "pending") {
    const chars = [...state.invitation.code];
    return (
      <section
        aria-labelledby="duo-titre"
        className="mt-3 flex flex-col gap-3.5 rounded-3xl border-[1.5px] border-energy/35 bg-surface p-5"
      >
        <div className="flex items-center gap-3">
          <span
            className="h-2.5 w-2.5 flex-none rounded-full bg-energy shadow-[0_0_0_5px_rgba(204,255,2,0.18)]"
            aria-hidden
          />
          <h2 id="duo-titre" className="text-[21px] font-black text-fg">
            Invitation en attente
          </h2>
        </div>
        <p className="text-balance text-base leading-snug text-fg-muted">
          Tu verras ton duo ici dès que ton partenaire aura accepté.
        </p>
        <div
          className="grid grid-cols-6 gap-2"
          role="group"
          aria-label={`Code d'invitation ${chars.join(" ")}`}
        >
          {chars.map((c, i) => (
            <span
              key={i}
              aria-hidden
              className="flex h-12 items-center justify-center rounded-[14px] bg-surface2 font-oswald text-[28px] font-bold text-energy"
            >
              {c}
            </span>
          ))}
        </div>
        <p className="text-sm text-fg-muted">
          Valable jusqu&apos;au {formatInviteExpiry(state.invitation.expiresAt)}
        </p>
        <Link
          href="/duo/inviter"
          className="flex h-[52px] items-center justify-center rounded-2xl bg-energy text-[17px] font-extrabold text-ink"
        >
          Partager l&apos;invitation
        </Link>
        <RevokeInvitationButton />
      </section>
    );
  }

  return (
    <section
      aria-labelledby="duo-titre"
      className="mt-3 flex flex-col gap-3.5 overflow-hidden rounded-3xl border-[1.5px] border-energy/35 bg-surface p-5"
    >
      <div className="flex items-center" aria-hidden>
        <span
          className="relative z-[1] h-11 w-11 rounded-full border-[3px] border-surface"
          style={{ background: me.color }}
        />
        <span className="-ml-3 flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-[#6E6E78] text-fg-muted">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="h-[18px] w-[18px]">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
          </svg>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 id="duo-titre" className="text-[21px] font-black text-fg">
          S&apos;entraîner à deux
        </h2>
        <p className="text-balance text-base leading-snug text-fg-muted">
          Partagez vos séances types, voyez les séances de l&apos;autre et comparez vos semaines.
        </p>
      </div>
      <InviteButton />
      <Link
        href="/duo/rejoindre"
        className="-mt-1.5 flex min-h-11 items-center justify-center text-base font-bold text-energy"
      >
        J&apos;ai reçu un code
      </Link>
    </section>
  );
}
