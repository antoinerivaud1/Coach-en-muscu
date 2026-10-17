"use client";

import { useState } from "react";
import LineChart, { type ChartPoint } from "@/components/LineChart";
import type { ExerciseSeries } from "@/lib/data/progress";

type Metric = "weight" | "e1rm";

type Props = {
  series: ExerciseSeries[];
};

/** Courbes d'un exercice. CM-118 (A2) : neutre, l'orange reste pour l'action. */
export default function ProgressView({ series }: Props) {
  const [selected, setSelected] = useState<string>(
    series[0]?.exercise_id ?? "",
  );
  const [metric, setMetric] = useState<Metric>("weight");

  if (series.length === 0) {
    return (
      <div className="mt-8 rounded-card border border-line bg-surface p-6 text-center">
        <p className="text-fg">Pas encore de séance enregistrée</p>
        <p className="mt-1 text-sm text-fg-muted">
          Tes courbes apparaîtront ici dès ta première séance loggée.
        </p>
      </div>
    );
  }

  const current = series.find((s) => s.exercise_id === selected) ?? series[0]!;
  const points: ChartPoint[] = current.points.map((p) => ({
    label: p.label,
    value: metric === "weight" ? p.topWeight : Math.round(p.e1rm),
  }));

  const latest = current.points[current.points.length - 1];
  const first = current.points[0];
  const latestVal =
    latest != null ? (metric === "weight" ? latest.topWeight : Math.round(latest.e1rm)) : 0;
  const firstVal =
    first != null ? (metric === "weight" ? first.topWeight : Math.round(first.e1rm)) : 0;
  const delta = latestVal - firstVal;

  return (
    <div className="mt-4">
      {/* Exercise selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {series.map((s) => (
          <button
            key={s.exercise_id}
            type="button"
            onClick={() => setSelected(s.exercise_id)}
            aria-pressed={s.exercise_id === current.exercise_id}
            className={`min-h-10 shrink-0 rounded-full px-4 text-[15px] font-semibold transition-colors ${
              s.exercise_id === current.exercise_id
                ? "bg-fg text-ink"
                : "bg-surface2 text-fg-soft"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="mt-3 rounded-card border border-line bg-surface px-4 pb-4 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold text-fg">{current.name}</h2>
            <p className="text-[15px] text-fg-muted">
              {current.points.length} séance
              {current.points.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="glass flex flex-none rounded-full p-[3px] text-[13px]">
            {([
              ["weight", "Poids max"],
              ["e1rm", "1RM est."],
            ] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                aria-pressed={metric === m}
                onClick={() => setMetric(m)}
                className={`min-h-9 rounded-full px-3 ${
                  metric === m
                    ? "bg-[var(--glass-active)] font-semibold text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                    : "font-medium text-fg-soft"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-oswald text-[40px] font-extrabold leading-[46px] text-fg">{latestVal}</span>
          <span className="text-[17px] font-semibold text-fg-muted">kg</span>
          {current.points.length > 1 && (
            <span
              className={`ml-1 text-[15px] font-bold ${
                delta > 0
                  ? "text-success"
                  : delta < 0
                    ? "text-danger"
                    : "text-fg-muted"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {delta} kg depuis le début
            </span>
          )}
        </div>

        <div className="mt-3">
          <LineChart points={points} />
        </div>
      </div>

      {/* Recent sessions table */}
      <div className="mt-3.5 rounded-card border border-line bg-surface px-4 py-3.5">
        <h3 className="text-[15px] font-semibold text-fg-muted">
          Dernières séances
        </h3>
        <ul className="mt-1 divide-y divide-line">
          {[...current.points]
            .slice(-8)
            .reverse()
            .map((p, i) => (
              <li
                key={i}
                className="flex min-h-11 items-center justify-between text-[15px]"
              >
                <span className="text-fg-muted">{p.label}</span>
                <span>
                  <span className="font-medium">{p.topWeight}</span>
                  <span className="text-fg-muted"> kg · 1RM </span>
                  <span className="font-medium">{Math.round(p.e1rm)}</span>
                </span>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
