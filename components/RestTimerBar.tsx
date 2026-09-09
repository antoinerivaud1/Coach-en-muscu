"use client";

import type { ReactNode } from "react";
import { formatClock } from "@/lib/utils/training";

/** Hauteur de la ligne du timer, hors safe area. */
const ROW_HEIGHT = 64;
/** Épaisseur du liseré de progression sous la ligne. */
const PROGRESS_HEIGHT = 3;

/**
 * Hauteur réelle du bloc compact, safe area exclue. Sert aussi à calculer le
 * `rootMargin` de l'IntersectionObserver côté séance, pour que la bascule
 * grand -> compact se fasse pile quand la carte glisse sous la barre.
 */
export const REST_BAR_CONTENT_HEIGHT = ROW_HEIGHT + PROGRESS_HEIGHT;

/**
 * Mesure `env(safe-area-inset-top)` en pixels. La valeur n'est pas lisible
 * directement en JS : on la fait résoudre par le moteur de style sur un
 * élément sonde éphémère. Renvoie 0 hors encoche (et hors navigateur).
 */
export function readSafeAreaTop(): number {
  if (typeof document === "undefined") return 0;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(safe-area-inset-top,0px)";
  document.body.appendChild(probe);
  const h = probe.getBoundingClientRect().height;
  probe.remove();
  return Number.isFinite(h) ? h : 0;
}

type Props = {
  remainingSeconds: number;
  totalSeconds: number;
  onAddSeconds: (delta: number) => void;
  onSkip: () => void;
  /**
   * Emplacement sous le timer, réservé à la barre de progression de séance
   * (CM-67) : ordre produit imposé, timer au-dessus.
   */
  children?: ReactNode;
};

/**
 * État compact du timer de repos (CM-73) : barre épinglée en haut de l'écran
 * quand la carte du timer est sortie du viewport. `fixed` et non `sticky` :
 * hors du flux, donc son apparition ne décale jamais le contenu.
 */
export default function RestTimerBar({
  remainingSeconds,
  totalSeconds,
  onAddSeconds,
  onSkip,
  children,
}: Props) {
  const frac =
    totalSeconds > 0
      ? Math.max(0, Math.min(1, remainingSeconds / totalSeconds))
      : 0;

  return (
    <div className="fixed inset-x-0 top-0 z-50 border-b border-line bg-ink pt-[env(safe-area-inset-top)]">
      <div
        className="mx-auto flex max-w-lg items-center gap-3 px-5"
        style={{ height: ROW_HEIGHT }}
      >
        <div className="flex flex-col justify-center">
          <span className="text-[9px] font-extrabold uppercase leading-none tracking-[0.18em] text-fg-muted">
            Repos
          </span>
          <span
            role="timer"
            aria-label="Temps de repos restant"
            className="mt-1 font-oswald text-3xl font-bold leading-none tabular-nums text-energy"
          >
            {formatClock(remainingSeconds)}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAddSeconds(-15)}
            className="flex h-10 items-center rounded-xl border border-line bg-surface2 px-2.5 font-oswald text-sm font-semibold text-fg active:bg-white/10"
            aria-label="Retirer 15 secondes de repos"
          >
            −15
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex h-10 items-center rounded-xl border border-line bg-surface2 px-2.5 font-oswald text-sm font-semibold text-fg active:bg-white/10"
          >
            Passer
          </button>
          <button
            type="button"
            onClick={() => onAddSeconds(15)}
            className="flex h-10 items-center rounded-xl border border-line bg-surface2 px-2.5 font-oswald text-sm font-semibold text-fg active:bg-white/10"
            aria-label="Ajouter 15 secondes de repos"
          >
            +15
          </button>
        </div>
      </div>

      <div className="bg-surface2" style={{ height: PROGRESS_HEIGHT }}>
        <div
          className="h-full bg-energy"
          style={{ width: `${frac * 100}%`, transition: "width 250ms linear" }}
        />
      </div>

      {children}
    </div>
  );
}
