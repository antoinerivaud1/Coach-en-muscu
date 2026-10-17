import { initialOf } from "@/lib/onboarding";
import { memberCss } from "@/lib/members";

/**
 * CM-86 : avatar d'un membre, son initiale sur un fond teinté de sa couleur
 * (pas encore de photo : `avatar_url` reste null dans ce ticket).
 */
export default function MemberAvatar({
  name,
  color,
  size = 56,
  className = "",
}: {
  name: string;
  color: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`flex flex-none items-center justify-center font-oswald font-bold ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        border: `2px solid ${memberCss(color)}`,
        background: memberCss(color, 0.1),
        color: memberCss(color),
        fontSize: Math.round(size * 0.45),
      }}
    >
      {initialOf(name)}
    </span>
  );
}
