"use client";

import { useOnline } from "@/hooks/useOnline";
import {
  formatDataStamp,
  isShowingOfflineData,
  oldestDataStamp,
  type OfflineSource,
} from "@/lib/offline/readCache";

/**
 * CM-90 (PR 3) : bandeau discret en haut d'un écran affiché depuis le cache
 * local. « Hors ligne · données du 13/10 à 18:42 ». Disparaît seul dès qu'une
 * lecture réussit.
 */
export default function OfflineBanner({
  sources,
  className = "",
}: {
  sources: readonly OfflineSource[];
  className?: string;
}) {
  const online = useOnline();
  if (!isShowingOfflineData(sources, online)) return null;
  const stamp = oldestDataStamp(sources);
  return (
    <p
      role="status"
      className={`flex items-center gap-2 rounded-full bg-surface2 px-3 py-1.5 text-sm text-fg-muted ${className}`}
    >
      <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-warning" />
      <span>
        Hors ligne{stamp !== null ? ` · données du ${formatDataStamp(stamp)}` : ""}
      </span>
    </p>
  );
}

/**
 * Sous une action en ligne seulement (désactivée hors ligne) : dit pourquoi
 * le bouton ne répond pas.
 */
export function OnlineOnlyHint({ className = "" }: { className?: string }) {
  const online = useOnline();
  if (online) return null;
  return <p className={`text-sm text-fg-muted ${className}`}>Disponible avec du réseau.</p>;
}
