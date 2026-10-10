"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { acceptInvitation, type DuoActionState } from "@/lib/actions/duo";
import { MEMBER_COLORS, isMemberColor, DEFAULT_MEMBER_COLOR, type MemberColor } from "@/lib/members";
import ColorPicker from "@/components/onboarding/ColorPicker";
import DuoAvatars from "@/components/duo/DuoAvatars";

/**
 * CM-87 : confirmation avant de rejoindre (maquette 9). En cas de conflit de
 * couleur, l'invité en choisit une autre avant d'accepter.
 */
export default function ConfirmJoinForm({
  code,
  inviterName,
  inviterColor,
  myName,
  myColor,
  colorConflict,
}: {
  code: string;
  inviterName: string;
  inviterColor: string;
  myName: string;
  myColor: string;
  colorConflict: boolean;
}) {
  const [state, action, pending] = useActionState<DuoActionState, FormData>(acceptInvitation, {});
  const initial: MemberColor = colorConflict
    ? (MEMBER_COLORS.find((c) => c.value !== inviterColor)?.value ?? DEFAULT_MEMBER_COLOR)
    : isMemberColor(myColor)
      ? myColor
      : DEFAULT_MEMBER_COLOR;
  const [color, setColor] = useState<MemberColor>(initial);
  const sameAsInviter = color === inviterColor;
  const colorLabel = (v: string) =>
    (MEMBER_COLORS.find((c) => c.value === v)?.label ?? "").toLocaleLowerCase("fr-FR");

  const facts = [
    `Vous partagez la bibliothèque de séances d’${inviterName}`.replace(
      /d’([^aeiouyhéèêàâîôûAEIOUYHÉÈÊÀÂÎÔÛ])/,
      "de $1",
    ),
    "Vous voyez les séances l’un de l’autre",
    "Tes séances déjà faites restent à toi",
  ];

  return (
    <form action={action} className="flex flex-1 flex-col">
      <input type="hidden" name="code" value={code} />
      {colorConflict && <input type="hidden" name="accent_color" value={color} />}

      <div className="mt-7 flex justify-center">
        <DuoAvatars
          members={[
            { id: "inviter", name: inviterName, color: inviterColor },
            { id: "me", name: myName, color },
          ]}
          size={88}
        />
      </div>

      <h1 className="mt-[22px] text-balance text-center text-[28px] font-black leading-tight tracking-tight text-fg">
        {inviterName} t&apos;invite à s&apos;entraîner en duo
      </h1>

      <ul className="mt-6 flex flex-col rounded-[20px] border border-line bg-surface">
        {facts.map((f, i) => (
          <li
            key={f}
            className={`flex items-start gap-3 px-4 py-3.5 ${i > 0 ? "border-t border-white/[0.06]" : ""}`}
          >
            <span className="flex h-[26px] w-[26px] flex-none items-center justify-center rounded-lg bg-energy/[0.12] text-energy" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
            <span className="text-base leading-snug text-[#E4E4EA]">{f}</span>
          </li>
        ))}
      </ul>

      {colorConflict ? (
        <div className="mt-3 rounded-[20px] border border-line bg-surface p-4">
          <span id="ta-couleur" className="text-[17px] font-semibold text-fg">
            Ta couleur dans le duo
          </span>
          <div className="mt-3">
            <ColorPicker value={color} onChange={setColor} labelId="ta-couleur" />
          </div>
          <p className="mt-3 text-balance text-sm leading-snug text-fg-muted">
            {inviterName} utilise déjà le {colorLabel(inviterColor)}&nbsp;: chaque membre garde une couleur à lui.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex min-h-[60px] items-center justify-between rounded-[20px] border border-line bg-surface px-4">
          <span className="text-[17px] font-semibold text-fg">Ta couleur dans le duo</span>
          <span className="flex items-center gap-2 text-base text-fg-muted">
            <span className="h-[18px] w-[18px] rounded-md" style={{ background: color }} aria-hidden />
            {MEMBER_COLORS.find((c) => c.value === color)?.label}
          </span>
        </div>
      )}

      {state.error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-base text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex-1" />

      <button
        type="submit"
        disabled={pending || sameAsInviter}
        className="mt-6 h-14 rounded-2xl bg-energy text-[17px] font-extrabold text-ink disabled:opacity-40"
      >
        {pending ? "Un instant…" : "Rejoindre le duo"}
      </button>
      <Link
        href="/profile"
        className="mt-1.5 flex h-11 items-center justify-center text-base font-semibold text-fg-muted"
      >
        Pas maintenant
      </Link>
    </form>
  );
}
