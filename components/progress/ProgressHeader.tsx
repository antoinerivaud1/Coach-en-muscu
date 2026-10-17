import Link from "next/link";

/**
 * CM-117 : en-tête de l'onglet Progrès. Un seul titre, et un sélecteur en
 * verre entre les deux vues : Courbes (`/progress`) et Historique
 * (`/history`). Deux routes gardées telles quelles (liens existants, export
 * statique iPhone, cache hors ligne).
 */
export type ProgressViewId = "curves" | "history";

const VIEWS: { id: ProgressViewId; href: string; label: string }[] = [
  { id: "curves", href: "/progress", label: "Courbes" },
  { id: "history", href: "/history", label: "Historique" },
];

export default function ProgressHeader({ view }: { view: ProgressViewId }) {
  return (
    <>
      <h1 className="mx-1 text-[34px] font-bold leading-[41px] text-fg">Progrès</h1>
      <nav aria-label="Vue" className="glass mt-3 grid h-12 grid-cols-2 rounded-full p-1">
        {VIEWS.map((v) => {
          const active = v.id === view;
          return (
            <Link
              key={v.id}
              href={v.href}
              aria-current={active ? "page" : undefined}
              className={`flex h-10 items-center justify-center rounded-full text-[15px] ${
                active
                  ? "bg-[var(--glass-active)] font-semibold text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                  : "font-medium text-fg-soft"
              }`}
            >
              {v.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
