"use client";

import { useEffect, useId, useState } from "react";

/**
 * Feuille de sortie d'une séance en cours (CM-94).
 *
 * Seule porte de sortie du logger avant la fin du dernier exercice : le lien
 * « Terminer maintenant », placé sous « Valider la série », clôturait la
 * séance au moindre tap raté. La croix ouvre désormais cette feuille, et
 * l'action par défaut (bouton plein, fond, Échap) est toujours « Continuer ».
 *
 * Confirmation custom : `window.confirm` est inerte en PWA iOS standalone
 * (CM-70). Le composant ne fait aucun appel réseau, le logger s'en charge.
 */
export default function ExitSessionSheet({
  open,
  validatedCount,
  exercisesDone,
  exercisesTotal,
  isBusy,
  onClose,
  onQuit,
  onFinish,
  onDiscard,
}: {
  open: boolean;
  validatedCount: number;
  exercisesDone: number;
  exercisesTotal: number;
  isBusy: boolean;
  onClose: () => void;
  onQuit: () => void;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  const titleId = useId();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // Le composant reste monté feuille fermée : la confirmation de suppression
  // ne doit pas survivre à une fermeture.
  useEffect(() => {
    if (!open) setConfirmDiscard(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isBusy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isBusy, onClose]);

  if (!open) return null;

  const isEmpty = validatedCount === 0;
  const setsLabel = `${validatedCount} série${validatedCount > 1 ? "s" : ""} enregistrée${
    validatedCount > 1 ? "s" : ""
  }`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      onClick={() => !isBusy && onClose()}
    >
      <div
        className="w-full max-w-lg rounded-t-2xl border-t border-line bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <h2 id={titleId} className="text-lg font-black tracking-tight text-fg">
          {isEmpty ? "Abandonner la séance ?" : "Séance en cours"}
        </h2>
        <p className="mt-1 text-sm text-fg-muted">
          {isEmpty
            ? "Aucune série validée pour l'instant."
            : `${setsLabel} · ${exercisesDone}/${exercisesTotal} exercice${
                exercisesTotal > 1 ? "s" : ""
              }`}
        </p>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isBusy}
            className="w-full rounded-2xl bg-energy py-4 text-[17px] font-extrabold text-ink disabled:opacity-50"
          >
            Continuer la séance
          </button>

          {isEmpty ? (
            <button
              type="button"
              onClick={onDiscard}
              disabled={isBusy}
              className="w-full rounded-xl bg-surface2 py-3 text-sm font-bold text-flame disabled:opacity-50"
            >
              {isBusy ? "Suppression…" : "Abandonner"}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onQuit}
                disabled={isBusy}
                className="w-full rounded-xl bg-surface2 py-3 text-sm font-bold text-fg disabled:opacity-50"
              >
                Quitter sans terminer
                <span className="mt-0.5 block text-[11px] font-semibold text-fg-muted">
                  Tu pourras la reprendre depuis l&apos;accueil
                </span>
              </button>
              <button
                type="button"
                onClick={onFinish}
                disabled={isBusy}
                className="w-full rounded-xl bg-surface2 py-3 text-sm font-bold text-fg disabled:opacity-50"
              >
                Terminer la séance
              </button>

              {confirmDiscard ? (
                <div className="mt-2 rounded-xl border border-flame/40 bg-flame/10 p-3">
                  <p className="text-xs font-semibold text-flame">
                    Supprimer la séance et ses séries ? C&apos;est définitif.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={onDiscard}
                      disabled={isBusy}
                      className="flex-1 rounded-lg bg-flame py-2 text-xs font-extrabold text-ink disabled:opacity-50"
                    >
                      {isBusy ? "Suppression…" : "Supprimer"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDiscard(false)}
                      disabled={isBusy}
                      className="flex-1 rounded-lg bg-surface2 py-2 text-xs font-semibold text-fg"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDiscard(true)}
                  disabled={isBusy}
                  className="mt-2 w-full py-2 text-center text-xs font-semibold text-flame disabled:opacity-50"
                >
                  Supprimer la séance
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
