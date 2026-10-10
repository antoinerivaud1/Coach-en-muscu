"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { getGuide } from "@/lib/exerciseGuides";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import { SILHOUETTE_LABELS, type Silhouette } from "@/lib/silhouette";
import { useSilhouette } from "@/hooks/useSilhouette";
import MuscleMap from "@/components/MuscleMap";
import MuscleLegend from "@/components/MuscleLegend";

const SILHOUETTES: Silhouette[] = ["homme", "femme"];

/**
 * Fiche exercice V2 (CM-30) : en-tête, carte musculaire face et dos avec
 * bascule de silhouette, légende, puis « Exécution » et « À éviter » pour les
 * exercices du catalogue système. Ouverte en plein écran depuis le guide ou
 * le bouton « i » de la carte d'exercice en séance.
 */
export default function ExerciseInfo({
  name,
  muscleGroup,
  isCompound,
  isCustom = false,
  colorRole,
  className,
  triggerClassName,
  children,
}: {
  name: string;
  muscleGroup: string;
  /** Polyarticulaire / isolation, quand la donnée est connue. */
  isCompound?: boolean;
  /** Exercice perso du duo : pas de fiche technique. */
  isCustom?: boolean;
  /** Rôle couleur du profil actif, pour la silhouette par défaut. */
  colorRole?: "toi" | "elle" | null;
  className?: string;
  triggerClassName?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [silhouette, setSilhouette] = useSilhouette(colorRole);
  const titleId = useId();
  const guide = getGuide(name, { isCustom });

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const tags: string[] = [];
  if (guide) tags.push(guide.equipment);
  if (isCompound !== undefined) tags.push(isCompound ? "Polyarticulaire" : "Isolation");
  if (isCustom) tags.push("Perso");

  return (
    <>
      {children ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Fiche exercice\u00a0: ${name}`}
          className={triggerClassName}
        >
          {children}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Fiche exercice\u00a0: ${name}`}
          className={
            className ??
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-line bg-surface2 text-fg active:bg-white/10"
          }
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5M12 8h.01" />
          </svg>
        </button>
      )}
      {/* Portail vers <body> : la carte d'exercice en séance peut être
          atténuée (opacity), ce qui atténuerait aussi la fiche. */}
      {open && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-ink"
        >
          <div className="mx-auto flex max-w-lg flex-col gap-5 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer la fiche"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface text-fg active:bg-surface2"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <span className="font-oswald text-[13px] font-semibold uppercase tracking-[0.14em] text-fg-muted">
                Fiche exercice
              </span>
              <span className="h-11 w-11" aria-hidden />
            </div>

            <header className="flex flex-col gap-2.5">
              <h2
                id={titleId}
                className="text-balance font-oswald text-[34px] font-bold uppercase leading-[1.15] text-fg"
              >
                {name}
              </h2>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full bg-energy px-3 py-1 text-xs font-bold text-energy-fg">
                  {MUSCLE_GROUP_LABELS[muscleGroup] ?? muscleGroup}
                </span>
                {tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-fg"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </header>

            <section
              aria-label="Muscles sollicités"
              className="flex flex-col gap-3 rounded-2xl border border-line bg-surface px-3 pb-4 pt-3"
            >
              <div className="flex justify-center gap-2" role="group" aria-label="Silhouette affichée">
                {SILHOUETTES.map((s) => {
                  const active = s === silhouette;
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setSilhouette(s)}
                      className={`h-11 min-w-[88px] rounded-full px-4 text-sm font-semibold ${
                        active
                          ? "bg-fg text-ink"
                          : "border border-white/15 text-fg-muted active:bg-surface2"
                      }`}
                    >
                      {SILHOUETTE_LABELS[s]}
                    </button>
                  );
                })}
              </div>
              <MuscleMap name={name} muscleGroup={muscleGroup} silhouette={silhouette} />
              <MuscleLegend name={name} muscleGroup={muscleGroup} />
            </section>

            {guide && (
              <>
                <section className="flex flex-col gap-3">
                  <h3 className="font-oswald text-lg font-bold uppercase tracking-[0.06em] text-fg">
                    Exécution
                  </h3>
                  <ol className="flex flex-col gap-3">
                    {guide.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-surface2 font-oswald text-base font-bold text-energy">
                          {i + 1}
                        </span>
                        <span className="text-pretty text-base text-fg">{step}</span>
                      </li>
                    ))}
                  </ol>
                </section>

                <section className="flex flex-col gap-2.5 rounded-2xl border border-flame/40 bg-flame/10 px-4 py-3.5">
                  <h3 className="flex items-center gap-2 font-oswald text-base font-bold uppercase tracking-[0.06em] text-flame">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M12 9v4M12 17h.01" />
                      <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
                    </svg>
                    À éviter
                  </h3>
                  <ul className="flex flex-col gap-1.5">
                    {guide.avoid.map((a, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-base text-fg">
                        <span className="mt-[10px] h-1.5 w-1.5 flex-none rounded-full bg-flame" aria-hidden />
                        <span className="text-pretty">{a}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="flex flex-col gap-1.5">
                  <h3 className="font-oswald text-base font-bold uppercase tracking-[0.06em] text-fg-muted">
                    Étirement
                  </h3>
                  <p className="text-pretty text-base text-fg">{guide.stretch}</p>
                </section>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
