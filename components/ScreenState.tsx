"use client";

import { useOnline } from "@/hooks/useOnline";

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

/** CM-90 (PR 3) : hors ligne, sans copie locale de cet écran. */
export const OFFLINE_NO_DATA_MESSAGE =
  "Pas de réseau, et cet écran n'a pas encore été ouvert sur ce téléphone. Il s'affichera au retour du réseau.";

/**
 * Lecture en échec : message en français et bouton « Réessayer ». Sans
 * message imposé et hors ligne : explique qu'aucune copie locale n'existe.
 */
export function ScreenError({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const online = useOnline();
  message ??= online
    ? "Impossible de charger cet écran. Vérifie ta connexion."
    : OFFLINE_NO_DATA_MESSAGE;
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
