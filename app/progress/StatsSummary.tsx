import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";

export type StatsData = {
  sessionsThisMonth: number;
  sessionsDelta: number;
  totalVolumeKg: number;
  totalSets: number;
  recordE1rm: number;
  recordExercise: string;
  weeks: { label: string; volume: number }[];
  groups: { group: string; pct: number }[];
};

function formatVolume(kg: number): string {
  if (kg >= 1000) {
    return `${(kg / 1000).toLocaleString("fr-FR", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} t`;
  }
  return `${Math.round(kg).toLocaleString("fr-FR")} kg`;
}

export default function StatsSummary({
  stats,
  color,
}: {
  stats: StatsData;
  color: string;
}) {
  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.volume));
  const delta = stats.sessionsDelta;

  return (
    <div className="mt-4 space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs text-fg-muted">Séances ce mois</p>
          <p className="mt-1 text-2xl font-bold">{stats.sessionsThisMonth}</p>
          {delta !== 0 && (
            <p
              className={`text-xs ${
                delta > 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {delta > 0 ? "+" : ""}
              {delta} vs mois dernier
            </p>
          )}
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs text-fg-muted">Volume total</p>
          <p className="mt-1 text-2xl font-bold">
            {formatVolume(stats.totalVolumeKg)}
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs text-fg-muted">Séries totales</p>
          <p className="mt-1 text-2xl font-bold">{stats.totalSets}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-xs text-fg-muted">Record (1RM est.)</p>
          <p className="mt-1 text-2xl font-bold">
            {Math.round(stats.recordE1rm)} kg
          </p>
          {stats.recordExercise && (
            <p className="truncate text-xs text-fg-muted">
              {stats.recordExercise}
            </p>
          )}
        </div>
      </div>

      {/* Volume par semaine */}
      {stats.weeks.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-fg">
            Volume par semaine
          </p>
          <div className="mt-3 flex h-24 items-end gap-2">
            {stats.weeks.map((w, i) => (
              <div
                key={i}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div
                  className="w-full rounded"
                  style={{
                    height: `${Math.max(4, (w.volume / maxWeek) * 80)}px`,
                    backgroundColor: w.volume > 0 ? color : "#2a2a33",
                  }}
                />
                <span className="text-[10px] text-fg-faint">{w.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Répartition par groupe */}
      {stats.groups.length > 0 && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <p className="text-sm font-semibold text-fg">
            Répartition par groupe
          </p>
          <div className="mt-3 space-y-2.5">
            {stats.groups.map((g) => (
              <div key={g.group}>
                <div className="mb-1 flex justify-between text-xs text-fg-muted">
                  <span>{MUSCLE_GROUP_LABELS[g.group] ?? g.group}</span>
                  <span>{g.pct}%</span>
                </div>
                <div className="h-1.5 rounded bg-surface2">
                  <div
                    className="h-full rounded"
                    style={{ width: `${g.pct}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
