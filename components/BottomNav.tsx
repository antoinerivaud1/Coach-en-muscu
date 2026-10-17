"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * CM-117 : barre d'onglets A2, une capsule en verre flottante à 3 onglets.
 * Aujourd'hui (accueil), Progrès (Courbes et Historique), Profil. Plus de
 * bouton « + » : on crée une séance depuis l'accueil (« Gérer mes séances »).
 */
type Item = { href: string; label: string; match: string[]; icon: (active: boolean) => React.ReactNode };

function Svg({ children, fill = false }: { children: React.ReactNode; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const ITEMS: Item[] = [
  {
    href: "/dashboard",
    label: "Aujourd'hui",
    match: ["/dashboard"],
    icon: (active) =>
      active ? (
        <Svg fill>
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </Svg>
      ) : (
        <Svg>
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        </Svg>
      ),
  },
  {
    href: "/progress",
    label: "Progrès",
    match: ["/progress", "/history"],
    icon: () => (
      <Svg>
        <path d="M3 3v18h18" />
        <path d="m19 9-5 5-4-4-3 3" />
      </Svg>
    ),
  },
  {
    href: "/profile",
    label: "Profil",
    match: ["/profile", "/guide"],
    icon: (active) => (
      <Svg fill={active}>
        {active ? (
          <>
            <circle cx="12" cy="7.5" r="4.5" />
            <path d="M3.5 21a8.5 7 0 0 1 17 0z" />
          </>
        ) : (
          <>
            <circle cx="12" cy="7.5" r="4" />
            <path d="M4 21a8 7 0 0 1 16 0" />
          </>
        )}
      </Svg>
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Onglets"
      className="glass fixed inset-x-5 z-30 mx-auto grid h-16 max-w-md grid-cols-3 rounded-full p-[5px]"
      style={{ bottom: "max(12px, calc(env(safe-area-inset-bottom) - 6px))" }}
    >
      {ITEMS.map((item) => {
        const active = item.match.some((m) => pathname === m || pathname.startsWith(m + "/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-col items-center justify-center gap-px rounded-full ${
              active
                ? "bg-[var(--glass-active)] text-accent shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]"
                : "text-fg"
            }`}
          >
            {item.icon(active)}
            <span className={`text-[12px] leading-[14px] ${active ? "font-semibold" : "font-medium"}`}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
