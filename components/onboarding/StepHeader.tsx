import Link from "next/link";

/**
 * CM-86 : en-tête des étapes d'onboarding (maquettes 2 à 4) : bouton retour
 * à gauche (ou rien), 3 traits de progression au centre.
 */
export default function StepHeader({
  step,
  backHref,
}: {
  step: 1 | 2 | 3;
  backHref?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Retour"
          className="flex h-11 w-11 items-center justify-center rounded-[14px] border border-line bg-surface text-fg"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="m15 18-6-6 6-6" />
          </svg>
        </Link>
      ) : (
        <span className="h-11 w-11" aria-hidden />
      )}
      <div className="flex gap-1.5" role="img" aria-label={`Étape ${step} sur 3`}>
        {[1, 2, 3].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-7 rounded-full ${i <= step ? "bg-energy" : "bg-[#2A2A33]"}`}
          />
        ))}
      </div>
      <span className="h-11 w-11" aria-hidden />
    </div>
  );
}
