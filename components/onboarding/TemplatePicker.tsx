"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { applyTemplate, markOnboarded, type OnboardingWriteResult } from "@/lib/data/onboarding";
import { onboardingDestination, rememberOnboarded, type OnboardingExit } from "@/lib/onboarding";

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
 *
 * CM-103 : `next` (lien d'invitation) remplace l'accueil comme destination
 * finale. Pour un invité (`invited`), « Créer ma séance » n'est pas proposé :
 * il quitterait le parcours avant la confirmation de l'invitation ; les
 * modèles restent facultatifs, comme pour un solo.
 *
 * CM-88 (PR 7) : écritures depuis le navigateur (lib/data/onboarding.ts ;
 * modèle et fin de l'onboarding en une transaction SQL). L'onboarding est
 * terminé AVANT de partir, puis la destination s'ouvre par RECHARGEMENT
 * COMPLET : le cache du navigateur (identité « pas onboardé ») repart de
 * zéro. CM-89 (PR 1) : le mémo « onboarding fait » de l'appareil est posé
 * juste avant, `OnboardingGate` laisse donc passer sans relire le profil
 * (et sans boucle vers /onboarding).
 */
export default function TemplatePicker({
  profileId,
  templates,
  initialError,
  next = "",
  invited = false,
}: {
  profileId: string;
  templates: TemplateCard[];
  initialError?: string;
  next?: string;
  invited?: boolean;
}) {
  const [picked, setPicked] = useState(templates[0]?.id ?? "");
  const [busy, setBusy] = useState<"template" | "finish" | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const pending = busy === "template";
  const error = failure ?? initialError;

  async function run(kind: "template" | "finish", exit: OnboardingExit, write: () => Promise<OnboardingWriteResult>) {
    if (busy) return;
    setBusy(kind);
    setFailure(null);
    const result = await write();
    if (!result.ok) {
      setFailure(result.error);
      setBusy(null);
      return;
    }
    rememberOnboarded(profileId);
    // Le bouton reste occupé jusqu'au départ de la page.
    window.location.assign(onboardingDestination(exit, next));
  }

  const finish = (exit: OnboardingExit) => (e: React.FormEvent) => {
    e.preventDefault();
    void run("finish", exit, () => markOnboarded(getSupabaseBrowserClient(), profileId));
  };

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
                selected ? "border-[1.5px] border-accent bg-energy/[0.06]" : "border border-line bg-surface"
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
                    selected ? "bg-energy" : "border-2 border-edge"
                  }`}
                >
                  {selected && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgb(var(--energy-fg))" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  )}
                </span>
              </span>
              <span className="mt-3 flex flex-wrap gap-1.5">
                {t.seances.map((s) => (
                  <span key={s} className="rounded-full bg-surface2 px-2.5 py-1.5 text-sm font-semibold text-fg-soft">
                    {s}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {!invited && (
        <form onSubmit={finish("/seances/new")}>
          <button
            type="submit"
            disabled={busy !== null}
            className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-[18px] border-[1.5px] border-dashed border-fg/15 text-base font-bold text-fg"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
              <path d="M5 12h14" /><path d="M12 5v14" />
            </svg>
            Créer ma séance
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger-soft">
          {error}
        </p>
      )}

      <div className="flex-1" />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!picked) return;
          void run("template", "/dashboard", () => applyTemplate(getSupabaseBrowserClient(), picked));
        }}
        className="mt-8"
      >
        <button
          type="submit"
          disabled={busy !== null || !picked}
          className="h-14 w-full rounded-2xl bg-energy text-base font-extrabold text-energy-fg disabled:opacity-60"
        >
          {pending ? "Ajout en cours…" : "Ajouter et c'est parti"}
        </button>
      </form>
      <form onSubmit={finish("/dashboard")}>
        <button
          type="submit"
          disabled={busy !== null}
          className="mt-1.5 flex h-11 w-full items-center justify-center text-base font-semibold text-fg-muted"
        >
          Passer pour l&apos;instant
        </button>
      </form>
    </>
  );
}
