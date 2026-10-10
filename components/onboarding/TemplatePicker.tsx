"use client";

import { useActionState, useState } from "react";
import {
  applyOnboardingTemplate,
  finishOnboarding,
  type TemplateFormState,
} from "@/app/onboarding/actions";

export type TemplateCard = {
  id: string;
  label: string;
  meta: string;
  seances: string[];
};

/**
 * CM-86 : « Par quoi tu commences ? » (maquette 4). Un modèle sélectionné
 * (le premier par défaut) s'ajoute en un tap ; « Créer ma séance » ouvre
 * l'écran de création existant, « Passer pour l'instant » va à l'accueil.
 * Les trois terminent l'onboarding.
 */
export default function TemplatePicker({
  templates,
  initialError,
}: {
  templates: TemplateCard[];
  initialError?: string;
}) {
  const [picked, setPicked] = useState(templates[0]?.id ?? "");
  const [state, action, pending] = useActionState<TemplateFormState, FormData>(
    applyOnboardingTemplate,
    {},
  );
  const error = state.error ?? initialError;

  return (
    <>
      <div role="radiogroup" aria-label="Modèles de séances" className="mt-6 flex flex-col gap-2.5">
        {templates.map((t) => {
          const selected = t.id === picked;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPicked(t.id)}
              className={`flex flex-col items-stretch rounded-[20px] px-4 py-3.5 text-left ${
                selected ? "border-[1.5px] border-energy bg-energy/[0.06]" : "border border-line bg-surface"
              }`}
            >
              <span className="flex w-full items-center justify-between gap-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-lg font-extrabold text-fg">{t.label}</span>
                  <span className="text-[15px] text-fg-muted">{t.meta}</span>
                </span>
                <span
                  aria-hidden
                  className={`flex h-[26px] w-[26px] flex-none items-center justify-center rounded-full ${
                    selected ? "bg-energy" : "border-2 border-[#3A3A44]"
                  }`}
                >
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
              </span>
              <span className="mt-3 flex flex-wrap gap-1.5">
                {t.seances.map((s) => (
                  <span key={s} className="rounded-full bg-surface2 px-2.5 py-1.5 text-sm font-semibold text-[#C9C9D1]">
                    {s}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <form action={finishOnboarding}>
        <input type="hidden" name="next" value="/seances/new" />
        <button
          type="submit"
          className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-white/15 text-base font-bold text-fg"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M5 12h14" /><path d="M12 5v14" />
          </svg>
          Créer ma séance
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-300">
          {error}
        </p>
      )}

      <div className="flex-1" />

      <form action={action} className="mt-8">
        <input type="hidden" name="template" value={picked} />
        <button
          type="submit"
          disabled={pending || !picked}
          className="h-14 w-full rounded-2xl bg-energy text-base font-extrabold text-ink disabled:opacity-60"
        >
          {pending ? "Ajout en cours…" : "Ajouter et c'est parti"}
        </button>
      </form>
      <form action={finishOnboarding}>
        <input type="hidden" name="next" value="/dashboard" />
        <button
          type="submit"
          className="mt-1.5 flex h-11 w-full items-center justify-center text-base font-semibold text-fg-muted"
        >
          Passer pour l&apos;instant
        </button>
      </form>
    </>
  );
}
