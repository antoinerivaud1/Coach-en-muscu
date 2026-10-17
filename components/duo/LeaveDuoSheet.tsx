"use client";

import { useOnline } from "@/hooks/useOnline";
import { useEffect, useId, useState } from "react";
import { useLeaveDuo } from "@/hooks/data/useDuoActions";

/**
 * CM-87 : « Quitter le duo » et sa feuille de confirmation (maquette 11).
 * Pas de `window.confirm` (inerte en PWA iOS, CM-70).
 * CM-88 (PR 7) : action lancée depuis le navigateur, puis rechargement
 * complet du Profil (`useLeaveDuo`).
 */
export default function LeaveDuoSheet({ partnerName }: { partnerName: string }) {
  // CM-90 (PR 3) : action en ligne seulement, désactivée hors ligne.
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const { run, pending, error } = useLeaveDuo();
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const items: { keep: boolean; text: string }[] = [
    { keep: true, text: "Tu gardes toutes tes séances, tes stats et tes records." },
    { keep: true, text: "Les séances types du duo sont copiées dans ta bibliothèque." },
    { keep: false, text: `${partnerName} ne voit plus tes séances, et toi plus les siennes.` },
    { keep: false, text: "Pour revenir en duo, il faudra une nouvelle invitation." },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!online}
        className="min-h-11 self-center px-3 text-base font-bold text-danger disabled:opacity-50"
      >
        Quitter le duo
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-lg flex-col rounded-t-[28px] border-t border-fg/[0.08] bg-surface px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3"
          >
            <span className="h-[5px] w-10 self-center rounded-full bg-edge" aria-hidden />
            <h2
              id={titleId}
              className="mt-5 text-balance text-2xl font-black leading-tight tracking-tight text-fg"
            >
              Quitter le duo avec {partnerName}&nbsp;?
            </h2>
            <ul className="mt-4 flex flex-col gap-3.5">
              {items.map((it) => (
                <li key={it.text} className="flex items-start gap-3">
                  <span
                    aria-hidden
                    className={`flex h-6 w-6 flex-none items-center justify-center rounded-lg ${
                      it.keep ? "bg-energy/[0.12] text-accent" : "bg-danger/[0.14] text-danger"
                    }`}
                  >
                    {it.keep ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="h-[15px] w-[15px]">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" className="h-[15px] w-[15px]">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    )}
                  </span>
                  <span className="text-balance text-base leading-snug text-fg-soft">{it.text}</span>
                </li>
              ))}
            </ul>
            {error && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!pending) run();
              }}
              className="mt-6"
            >
              <button
                type="submit"
                disabled={pending}
                className="h-[54px] w-full rounded-2xl bg-danger text-[17px] font-extrabold text-ink disabled:opacity-60"
              >
                {pending ? "Départ…" : "Quitter le duo"}
              </button>
            </form>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="mt-2 h-12 rounded-xl text-[17px] font-bold text-fg"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </>
  );
}
