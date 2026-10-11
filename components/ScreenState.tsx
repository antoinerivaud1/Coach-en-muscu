"use client";

/**
 * CM-88 : états communs des écrans client. Les pages ne sont plus rendues par
 * le serveur : à la première ouverture d'un écran, un squelette s'affiche le
 * temps de la requête (ensuite le cache prend le relais), et une erreur de
 * lecture propose de réessayer au lieu d'une page blanche.
 */

/** Squelette neutre : `rows` blocs de la taille d'une ligne de liste. */
export function ScreenSkeleton({ rows = 6, label = "Chargement" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-2">
      <span className="sr-only">{label}…</span>
      <div className="mb-4 h-8 w-2/3 animate-pulse rounded-lg bg-surface" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-lg bg-surface" />
      ))}
    </div>
  );
}

/** Lecture en échec : message en français et bouton « Réessayer ». */
export function ScreenError({
  message = "Impossible de charger cet écran. Vérifie ta connexion.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-2xl bg-surface p-4">
      <p className="text-base">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 w-full rounded-xl bg-surface2 py-3 text-base font-semibold active:opacity-80"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}
