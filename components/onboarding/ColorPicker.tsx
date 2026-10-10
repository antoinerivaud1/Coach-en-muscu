"use client";

import { MEMBER_COLORS, type MemberColor } from "@/lib/members";

/**
 * CM-86 : choix de la couleur de membre parmi les 6 de `MEMBER_COLORS` (le
 * vert acide reste réservé à l'interface). Pastilles de 44 px, une seule
 * active, annoncée par `aria-checked`.
 */
export default function ColorPicker({
  value,
  onChange,
  labelId,
}: {
  value: MemberColor;
  onChange: (color: MemberColor) => void;
  labelId: string;
}) {
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-6 gap-2.5">
      {MEMBER_COLORS.map((c) => {
        const selected = c.value === value;
        return (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={c.label}
            onClick={() => onChange(c.value)}
            className="h-11 rounded-[14px] focus:outline-none focus-visible:ring-2 focus-visible:ring-fg"
            style={{
              background: c.value,
              boxShadow: selected ? `0 0 0 3px #0B0B0F, 0 0 0 5px ${c.value}` : "none",
            }}
          />
        );
      })}
    </div>
  );
}
