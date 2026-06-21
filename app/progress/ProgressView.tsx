"use client";

import { useState } from "react";
import LineChart, { type ChartPoint } from "@/components/LineChart";

export type ExerciseSeries = {
  exercise_id: string;
  name: string;
  points: { label: string; topWeight: number; e1rm: number }[];
};

type Metric = "weight" | "e1rm";

type Props = {
  series: ExerciseSeries[];
  color: string;
};

export default function ProgressView({ series, color }: Props) {
  const [selected, setSelected] = useState<string>(
    series[0]?.exercise_id ?? "",
  );
  const [metric, setMetric] = useState<Metric>("weight");

  if (series.length === 0) {
    return (
      <div className="mt-8 rounded-xl border border-line bg-surface p-6 text-center">
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
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              s.exercise_id === current.exercise_id
                ? "bg-toi text-ink"
                : "bg-surface2 text-fg-muted"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold">{current.name}</h2>
            <p className="text-xs text-fg-muted">
              {current.points.length} séance
              {current.points.length > 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex overflow-hidden rounded-lg bg-surface2 text-xs">
            <button
              type="button"
              onClick={() => setMetric("weight")}
              className={`px-3 py-1.5 font-medium ${
                metric === "weight" ? "bg-toi text-ink" : "text-fg-muted"
              }`}
            >
              Poids max
            </button>
            <button
              type="button"
              onClick={() => setMetric("e1rm")}
              className={`px-3 py-1.5 font-medium ${
                metric === "e1rm" ? "bg-toi text-ink" : "text-fg-muted"
              }`}
            >
              1RM est.
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-3xl font-bold">{latestVal}</span>
          <span className="text-sm text-fg-muted">kg</span>
          {current.points.length > 1 && (
            <span
              className={`ml-2 text-sm font-medium ${
                delta > 0
                  ? "text-emerald-400"
                  : delta < 0
                    ? "text-red-400"
                    : "text-fg-muted"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {delta} kg depuis le début
            </span>
          )}
        </div>

        <div className="mt-3">
          <LineChart points={points} color={color} />
        </div>
      </div>

      {/* Recent sessions table */}
      <div className="mt-4 rounded-xl border border-line bg-surface p-4">
        <h3 className="text-sm font-semibold text-fg">
          Dernières séances
        </h3>
        <ul className="mt-2 divide-y divide-white/10">
          {[...current.points]
            .slice(-8)
            .reverse()
            .map((p, i) => (
              <li
                key={i}
                className="flex items-center justify-between py-2 text-sm"
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
