import { initialOf } from "@/lib/onboarding";

/**
 * CM-87 : pastilles rondes des membres du duo, l'une sur l'autre (accueil en
 * duo, confirmation). Initiale du prénom sur la couleur du membre.
 */
export default function DuoAvatars({
  members,
  size = 40,
}: {
  members: { id: string; name: string; color: string }[];
  size?: number;
}) {
  return (
    <span className="flex items-center" aria-hidden>
      {members.map((m, i) => (
        <span
          key={m.id}
          className="flex flex-none items-center justify-center rounded-full border-ink font-oswald font-bold text-ink"
          style={{
            width: size,
            height: size,
            background: m.color,
            borderWidth: Math.max(3, Math.round(size / 22)),
            marginLeft: i > 0 ? -Math.round(size / 4) : 0,
            fontSize: Math.round(size * 0.44),
          }}
        >
          {initialOf(m.name)}
        </span>
      ))}
    </span>
  );
}
