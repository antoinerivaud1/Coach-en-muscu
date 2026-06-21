"use client";

import { useState } from "react";
import { getGuide } from "@/lib/exerciseGuides";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import { getMuscleTags } from "@/lib/exerciseMuscles";
import MuscleMap from "@/components/MuscleMap";

export default function ExerciseInfo({
  name,
  muscleGroup,
  className,
  triggerClassName,
  children,
}: {
  name: string;
  muscleGroup: string;
  className?: string;
  triggerClassName?: string;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const g = getGuide(name, muscleGroup);

  return (
    <>
      {children ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Comment faire : ${name}`}
          className={triggerClassName}
        >
          {children}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Comment faire : ${name}`}
          className={
            className ??
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface2 text-sm font-bold text-fg active:bg-white/10"
          }
        >
          ?
        </button>
      )}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-line bg-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black tracking-tight">{name}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(getMuscleTags(name, muscleGroup).length
                    ? getMuscleTags(name, muscleGroup)
                    : [MUSCLE_GROUP_LABELS[muscleGroup] ?? muscleGroup]
                  ).map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-line bg-surface2 px-2.5 py-0.5 text-[11px] font-bold text-fg"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-fg-muted hover:text-fg"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <div className="mt-3 rounded-xl border border-line bg-ink/40 p-2">
              <MuscleMap name={name} muscleGroup={muscleGroup} />
            </div>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-fg-muted">
                  Mouvement
                </dt>
                <dd className="text-fg">{g.how}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-fg-muted">
                  À éviter
                </dt>
                <dd className="text-fg">{g.avoid}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-fg-muted">
                  Étirement
                </dt>
                <dd className="text-fg">{g.stretch}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
