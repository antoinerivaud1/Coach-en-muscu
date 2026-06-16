"use client";

import { useState } from "react";
import { getGuide } from "@/lib/exerciseGuides";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";

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
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-bold text-zinc-300 active:bg-zinc-700"
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
            className="w-full max-w-lg rounded-2xl bg-zinc-900 p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold">{name}</h3>
                <p className="text-xs font-medium text-toi">
                  {MUSCLE_GROUP_LABELS[muscleGroup] ?? muscleGroup}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-zinc-400 hover:text-zinc-200"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>
            <dl className="mt-3 space-y-2.5 text-sm">
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Mouvement
                </dt>
                <dd className="text-zinc-200">{g.how}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  À éviter
                </dt>
                <dd className="text-zinc-200">{g.avoid}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">
                  Étirement
                </dt>
                <dd className="text-zinc-200">{g.stretch}</dd>
              </div>
            </dl>
          </div>
        </div>
      )}
    </>
  );
}
