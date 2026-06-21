"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: React.ReactNode };

function Icon({ d, fill = false }: { d: string; fill?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[23px] w-[23px]"
      aria-hidden
    >
      {d.split("||").map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}

const ITEMS: Item[] = [
  {
    href: "/dashboard",
    label: "Séances",
    icon: (
      <Icon d="m6.5 6.5 11 11||m21 21-1-1||m3 3 1 1||m18 22 4-4||m2 6 4-4||m3 10 7-7||m14 21 7-7" />
    ),
  },
  {
    href: "/progress",
    label: "Stats",
    icon: <Icon d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  },
  {
    href: "/history",
    label: "Carnet",
    icon: (
      <Icon d="M8 2h8a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Z||M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2||M9 12h6||M9 16h6" />
    ),
  },
  {
    href: "/profile",
    label: "Profil",
    icon: (
      <Icon d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2||M12 7a4 4 0 1 0 0 0.001" />
    ),
  },
];

export default function BottomNav() {
  const pathname = usePathname();
  const left = ITEMS.slice(0, 2);
  const right = ITEMS.slice(2);

  const tab = (item: Item) => {
    const active =
      pathname === item.href || pathname.startsWith(item.href + "/");
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`flex flex-1 flex-col items-center gap-1 ${
          active ? "text-energy" : "text-[#6b6b73]"
        }`}
      >
        {item.icon}
        <span className="text-[10px] font-semibold">{item.label}</span>
      </Link>
    );
  };

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-start justify-between border-t border-white/[0.07] bg-ink/[0.88] px-8 pt-3.5 backdrop-blur-xl"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex w-full max-w-lg items-start justify-between">
        {left.map(tab)}
        <div className="flex w-14 justify-center">
          <Link
            href="/programs/new"
            aria-label="Nouveau programme"
            className="-mt-7 flex h-14 w-14 items-center justify-center rounded-full border-4 border-ink bg-energy shadow-[0_8px_24px_rgba(204,255,2,0.4)]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6">
              <path d="M5 12h14" />
              <path d="M12 5v14" />
            </svg>
          </Link>
        </div>
        {right.map(tab)}
      </div>
    </nav>
  );
}
