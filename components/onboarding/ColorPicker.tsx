"use client";

import { MEMBER_COLORS, type MemberColor } from "@/lib/members";

/**
 * CM-86 : choix de la couleur de membre parmi les 6 de `MEMBER_COLORS` (le
 * vert acide reste réservé à l'interface). Pastilles de 44 px, une seule
 * active, annoncée par `aria-checked`.
 *
 * CM-103 : `taken` = couleur déjà portée par le partenaire de duo. Sa
 * pastille est grisée (barrée), non sélectionnable, et annoncée « Rose,
 * couleur de Lina ». La mention visible est affichée par le parent.
 */
export default function ColorPicker({
  value,
  onChange,
  labelId,
  taken,
  describedBy,
}: {
  value: MemberColor;
  onChange: (color: MemberColor) => void;
  labelId: string;
  taken?: { color: MemberColor; label: string } | null;
  /** Id de la mention « Couleur de … », lue avec le groupe. */
  describedBy?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      aria-describedby={describedBy}
      className="grid grid-cols-6 gap-2.5"
    >
      {MEMBER_COLORS.map((c) => {
        const selected = c.value === value;
        const isTaken = taken?.color === c.value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={isTaken}
            aria-label={isTaken ? `${c.label}, ${taken!.label}` : c.label}
            data-taken={isTaken || undefined}
            onClick={() => {
              if (!isTaken) onChange(c.value);
            }}
            className={`relative h-11 overflow-hidden rounded-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-fg ${
              isTaken ? "cursor-not-allowed" : ""
            }`}
            style={{
              background: isTaken ? "transparent" : c.value,
              boxShadow: selected ? `0 0 0 3px #0B0B0F, 0 0 0 5px ${c.value}` : "none",
            }}
          >
            {isTaken && (
              <span
                aria-hidden
                className="absolute inset-0 rounded-[14px]"
                style={{ background: c.value, filter: "grayscale(1) brightness(0.5)" }}
              />
            )}
            {isTaken && (
              <svg
                aria-hidden
                viewBox="0 0 44 44"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                <line x1="6" y1="38" x2="38" y2="6" stroke="#F4F4F6" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
