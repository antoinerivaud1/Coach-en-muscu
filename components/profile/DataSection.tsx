import DeleteAccountSheet, { type DeleteAccountDuo } from "@/components/profile/DeleteAccountSheet";

/**
 * CM-60 : section « Mes données » du Profil : export (ZIP : CSV des séances
 * et séries, JSON complet) et suppression du compte (exigence App Store,
 * guideline 5.1.1(v)).
 */
export default function DataSection({
  duo,
  exportFailed,
}: {
  duo: DeleteAccountDuo;
  exportFailed: boolean;
}) {
  return (
    <section id="mes-donnees" aria-labelledby="mes-donnees-titre" className="mt-8 scroll-mt-4">
      <h2
        id="mes-donnees-titre"
        className="mb-2.5 text-[13px] font-extrabold uppercase tracking-[0.16em] text-fg-muted"
      >
        Mes données
      </h2>
      {exportFailed && (
        <p
          role="alert"
          className="mb-2.5 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-base text-red-300"
        >
          L&apos;export n&apos;a pas pu être préparé. Réessaie dans un instant.
        </p>
      )}
      <div className="flex flex-col gap-2.5">
        {/* Lien simple (pas next/link) : réponse en pièce jointe, téléchargée
            par le navigateur. */}
        <a
          href="/profile/export"
          download
          className="flex min-h-[64px] items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-white/20"
        >
          <span className="flex-1">
            <span className="block font-extrabold text-fg">Exporter mes données</span>
            <span className="mt-0.5 block text-xs font-semibold text-fg-muted">
              Séances et séries pour tableur, et tout le reste, en un fichier
            </span>
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none text-fg-muted" aria-hidden>
            <path d="M12 4v11" />
            <path d="m7 10 5 5 5-5" />
            <path d="M5 20h14" />
          </svg>
        </a>
        <DeleteAccountSheet duo={duo} />
      </div>
    </section>
  );
}
