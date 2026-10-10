"use client";

import { useEffect, useId, useRef, useState } from "react";
import { signOut } from "@/lib/actions/auth";
import { purgeLocalQueues, unsyncedLocalCount } from "@/lib/localQueues";

/**
 * Déconnexion (CM-59 B). Avant la server action, les files locales du compte
 * (séries et clôtures hors ligne, et leurs refus) sont effacées : un autre
 * compte sur le même téléphone ne doit pas en hériter.
 *
 * S'il reste des données jamais enregistrées, on prévient d'abord, par une
 * feuille de confirmation (`window.confirm` est inerte en PWA iOS, CM-70).
 */
export default function SignOutButton() {
  const formRef = useRef<HTMLFormElement>(null);
  const confirmed = useRef(false);
  const [unsynced, setUnsynced] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (unsynced === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setUnsynced(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [unsynced]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (confirmed.current) {
      purgeLocalQueues();
      return;
    }
    const n = unsyncedLocalCount();
    if (n === 0) {
      purgeLocalQueues();
      return;
    }
    e.preventDefault();
    setUnsynced(n);
  }

  function confirmSignOut() {
    confirmed.current = true;
    setUnsynced(null);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={signOut} onSubmit={onSubmit} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-2xl border border-line bg-surface2 py-3.5 text-sm font-bold text-fg active:bg-white/10"
        >
          Se déconnecter
        </button>
      </form>

      {unsynced !== null && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => setUnsynced(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl border-t border-line bg-surface px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <h2 id={titleId} className="text-lg font-black tracking-tight text-fg">
              Données non enregistrées
            </h2>
            <p className="mt-1 text-sm text-fg-muted">
              {unsynced} élément{unsynced > 1 ? "s" : ""} (séries ou fin de séance) n&apos;
              {unsynced > 1 ? "ont" : "a"} pas encore été enregistré{unsynced > 1 ? "s" : ""}.
              Te déconnecter les effacera de ce téléphone.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setUnsynced(null)}
                className="w-full rounded-xl bg-energy py-3 text-sm font-extrabold text-ink"
              >
                Rester connecté
              </button>
              <button
                type="button"
                onClick={confirmSignOut}
                className="w-full rounded-xl bg-surface2 py-3 text-sm font-semibold text-red-400"
              >
                Me déconnecter quand même
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
