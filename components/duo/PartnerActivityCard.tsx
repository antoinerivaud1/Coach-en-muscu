/**
 * CM-87 : activité du partenaire sur l'accueil en duo (maquette 10) : son
 * dernier record battu. Purement informatif, aucune notification.
 */
export default function PartnerActivityCard({
  name,
  color,
  exerciseName,
  detail,
}: {
  name: string;
  color: string;
  exerciseName: string;
  /** « 82,5 kg × 5 · hier ». */
  detail: string;
}) {
  return (
    <div className="mt-3.5 flex items-center gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5">
      <span
        className="flex h-10 w-10 flex-none items-center justify-center rounded-xl"
        style={{ color, background: `${color}1F` }}
        aria-hidden
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22" />
          <path d="M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8" />
          <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
        </svg>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-balance text-base font-bold leading-snug text-fg">
          <span style={{ color }}>{name}</span> a battu son record&nbsp;: {exerciseName}
        </span>
        <span className="text-sm text-fg-muted">{detail}</span>
      </div>
    </div>
  );
}
