import Link from "next/link";

/**
 * CM-87 : cadre des écrans plein écran du duo (inviter, rejoindre,
 * confirmer) : bouton de retour ou de fermeture de 44 px, contenu, pied
 * collé en bas.
 */
export default function DuoScreen({
  backHref,
  backLabel,
  icon,
  children,
  footer,
}: {
  backHref: string;
  backLabel: string;
  icon: "close" | "back";
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-lg flex-col px-5 pb-[max(2.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center">
        <Link
          href={backHref}
          aria-label={backLabel}
          className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-surface text-fg"
        >
          {icon === "close" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className="h-5 w-5" aria-hidden>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="m15 18-6-6 6-6" />
            </svg>
          )}
        </Link>
      </div>
      <div className="flex flex-1 flex-col">{children}</div>
      {footer && <div className="mt-6 flex flex-col">{footer}</div>}
    </main>
  );
}
