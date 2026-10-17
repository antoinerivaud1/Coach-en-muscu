import ExportButton from "@/components/profile/ExportButton";
import DeleteAccountSheet, { type DeleteAccountDuo } from "@/components/profile/DeleteAccountSheet";

/**
 * CM-60 : section « Mes données » du Profil : export (ZIP : CSV des séances
 * et séries, JSON complet) et suppression du compte (exigence App Store,
 * guideline 5.1.1(v)).
 *
 * CM-88 : l'export est construit dans le navigateur ; un échec s'affiche sous
 * le bouton (`EXPORT_ERROR_MESSAGE`), comme avant quand le bouton appelait la
 * route serveur. Le message de `?export=echec` (route ouverte directement)
 * n'a plus de raison d'être.
 */
export default function DataSection({
  profileId,
  duo,
  onAccountDeleted,
}: {
  profileId: string;
  duo: DeleteAccountDuo;
  /** Compte supprimé : l'écran cesse d'afficher les données (voir ProfileScreen). */
  onAccountDeleted: () => void;
}) {
  return (
    <section id="mes-donnees" aria-labelledby="mes-donnees-titre" className="mt-8 scroll-mt-4">
      <h2
        id="mes-donnees-titre"
        className="mb-2.5 text-[13px] font-bold uppercase tracking-[0.03em] text-fg-muted"
      >
        Mes données
      </h2>
      <div className="flex flex-col gap-2.5">
        <ExportButton variant="row" profileId={profileId} />
        <DeleteAccountSheet duo={duo} profileId={profileId} onDeleted={onAccountDeleted} />
      </div>
    </section>
  );
}
