"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { leaveDuo, type DuoActionState } from "@/lib/actions/duo";

/**
 * CM-87 : « Quitter le duo » et sa feuille de confirmation (maquette 11).
 * Pas de `window.confirm` (inerte en PWA iOS, CM-70).
 */
export default function LeaveDuoSheet({ partnerName }: { partnerName: string }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<DuoActionState, FormData>(leaveDuo, {});
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
        className="min-h-11 self-center px-3 text-base font-bold text-[#FF6B6B]"
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
            className="flex w-full max-w-lg flex-col rounded-t-[28px] border-t border-white/[0.08] bg-surface px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3"
          >
            <span className="h-[5px] w-10 self-center rounded-full bg-[#3A3A44]" aria-hidden />
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
                      it.keep ? "bg-energy/[0.12] text-energy" : "bg-[#FF5A5A]/[0.14] text-[#FF7A7A]"
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
                  <span className="text-balance text-base leading-snug text-[#E4E4EA]">{it.text}</span>
                </li>
              ))}
            </ul>
            {state.error && (
              <p role="alert" className="mt-4 text-sm text-red-400">
                {state.error}
              </p>
            )}
            <form action={action} className="mt-6">
              <button
                type="submit"
                disabled={pending}
                className="h-[54px] w-full rounded-2xl bg-[#FF5A5A] text-[17px] font-extrabold text-ink disabled:opacity-60"
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
