"use client";

import { useState } from "react";

/**
 * Bouton de soumission à confirmation, en deux temps et 100 % dans le DOM.
 *
 * CM-70 : la version précédente appelait `window.confirm()` et annulait la
 * soumission quand il renvoyait `false`. Or les dialogues natifs
 * (`alert`/`confirm`/`prompt`) sont supprimés ou renvoient immédiatement
 * `false` dans une web app iOS en `display: standalone` et dans la WKWebView
 * Capacitor — les deux contextes dans lesquels cette app tourne. Le bouton
 * devenait donc inerte, sans la moindre trace.
 *
 * Ici, le premier clic arme la confirmation (`type="button"`, aucune
 * soumission possible) et seul le second clic soumet réellement le formulaire,
 * via un vrai `type="submit"`. Aucun JavaScript ne peut plus avaler l'action.
 */
export default function ConfirmSubmit({
  message,
  confirmLabel = "Oui, supprimer",
  className,
  children,
}: {
  message: string;
  confirmLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" className={className} onClick={() => setArmed(true)}>
        {children}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-flame/40 bg-flame/10 p-2.5">
      <p className="text-xs font-semibold text-flame">{message}</p>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="flex-1 rounded-lg bg-surface2 py-2 text-xs font-semibold text-fg"
        >
          Annuler
        </button>
        <button
          type="submit"
          className="flex-1 rounded-lg bg-flame py-2 text-xs font-extrabold text-ink"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
