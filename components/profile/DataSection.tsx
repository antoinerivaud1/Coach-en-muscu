import ExportButton from "@/components/profile/ExportButton";
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
        <ExportButton variant="row" />
        <DeleteAccountSheet duo={duo} />
      </div>
    </section>
  );
}
