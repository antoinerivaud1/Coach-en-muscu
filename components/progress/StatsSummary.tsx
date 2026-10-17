import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import type { StatsData } from "@/lib/data/progress";
import { memberCss } from "@/lib/members";

function volumeParts(kg: number): { value: string; unit: string } {
  if (kg >= 1000) {
    return {
      value: (kg / 1000).toLocaleString("fr-FR", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
      unit: "T",
    };
  }
  return { value: Math.round(kg).toLocaleString("fr-FR"), unit: "kg" };
}

/** Résumé de l'onglet Courbes. CM-118 (A2) : neutre, l'orange marque la semaine en cours. */
export default function StatsSummary({ stats }: { stats: StatsData }) {
  const maxWeek = Math.max(1, ...stats.weeks.map((w) => w.volume));
  const vol = volumeParts(stats.totalVolumeKg);

  // Variation : dernière semaine vs précédente.
  const w = stats.weeks;
  const lastV = w[w.length - 1]?.volume ?? 0;
  const prevV = w[w.length - 2]?.volume ?? 0;
  const variation =
    prevV > 0 ? Math.round(((lastV - prevV) / prevV) * 100) : lastV > 0 ? 100 : 0;

  // Anneau objectif hebdo.
  const goalPct = Math.max(
    0,
    Math.min(1, stats.weekGoal > 0 ? stats.weekSessions / stats.weekGoal : 0),
  );
  const RC = 2 * Math.PI * 44;

  const maxCouple = Math.max(1, ...stats.couple.map((c) => c.sets));

  return (
    <div className="mt-4 space-y-3.5">
      {/* Carte volume + barres */}
      <div className="rounded-card border border-line bg-surface px-4 pb-4 pt-3.5">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[15px] font-semibold text-fg-muted">Volume soulevé</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-oswald text-[40px] font-extrabold leading-none text-fg">
                {vol.value}
              </span>
              <span className="text-[17px] font-semibold text-fg-muted">{vol.unit === "T" ? "t" : vol.unit}</span>
            </div>
          </div>
          {variation !== 0 && (
            <span
              className={`mt-1 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-extrabold ${
                variation > 0
                  ? "border-success/30 bg-success/10 text-success"
                  : "border-fg/10 bg-surface2 text-fg-muted"
              }`}
            >
              {variation > 0 ? "▲" : "▼"} {Math.abs(variation)} %
            </span>
          )}
        </div>
        <div className="mt-4 flex h-24 items-end justify-between gap-1.5">
          {stats.weeks.map((wk, i) => {
            const isLast = i === stats.weeks.length - 1;
            return (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span
                  className="w-full rounded-full"
                  style={{
                    height: `${Math.max(6, (wk.volume / maxWeek) * 80)}px`,
                    // CM-118 (A2) : barres neutres, la semaine en cours en orange.
                    backgroundColor:
                      wk.volume === 0 ? "rgb(var(--surface-2))" : isLast ? "rgb(var(--energy))" : "rgb(var(--fg) / 0.28)",
                  }}
                />
                <span className={`text-[12px] font-semibold ${isLast ? "text-accent" : "text-fg-muted"}`}>
                  {wk.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Anneau objectif + comparaison du duo */}
      <div className="flex gap-3.5">
        <div className="flex w-[130px] flex-none flex-col items-center justify-center rounded-[22px] border border-line bg-surface p-4">
          <div className="relative h-24 w-24">
            <svg viewBox="0 0 96 96" className="h-full w-full -rotate-90">
              <circle cx="48" cy="48" r="44" fill="none" stroke="rgb(var(--surface-2))" strokeWidth="9" />
              <circle
                cx="48"
                cy="48"
                r="44"
                fill="none"
                stroke="rgb(var(--energy))"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={RC}
                strokeDashoffset={RC * (1 - goalPct)}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-oswald text-xl font-bold text-fg">
              {stats.weekSessions}/{stats.weekGoal}
            </div>
          </div>
          <span className="mt-2.5 text-center text-[13px] font-semibold text-fg-muted">
            Objectif
            <br />
            hebdo
          </span>
        </div>

        {stats.couple.length > 1 ? (
          <div className="flex-1 rounded-[22px] border border-line bg-surface p-4">
            <div className="mb-3.5 text-[15px] font-semibold text-fg-muted">
              Séries de la semaine
            </div>
            <div className="space-y-3">
              {stats.couple.map((c) => (
                <div key={c.name}>
                  <div className="mb-1.5 flex justify-between">
                    <span className="text-[15px] font-semibold" style={{ color: memberCss(c.color) }}>
                      {c.name}
                    </span>
                    <span className="font-oswald text-[17px] font-bold text-fg">{c.sets}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-fg/10">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(4, (c.sets / maxCouple) * 100)}%`,
                        backgroundColor: memberCss(c.color),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center gap-2 rounded-[22px] border border-line bg-surface p-4">
            <div className="text-[15px] font-semibold text-fg-muted">
              Ce mois
            </div>
            <div className="font-oswald text-3xl font-bold text-fg">
              {stats.sessionsThisMonth}
              <span className="text-sm font-semibold text-fg-muted"> séances</span>
            </div>
            <div className="font-oswald text-3xl font-bold text-fg">
              {stats.totalSets}
              <span className="text-sm font-semibold text-fg-muted"> séries</span>
            </div>
          </div>
        )}
      </div>

      {/* Records récents */}
      {stats.recordE1rm > 0 && (
        <>
          <h2 className="mx-1 mt-2 text-[20px] font-bold leading-[25px] text-fg">Record récent</h2>
          <div className="flex items-center gap-3.5 rounded-card border border-line bg-surface px-4 py-3.5">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-energy/15 text-accent">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
                <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
                <path d="M4 22h16" />
                <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
                <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
                <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
              </svg>
            </span>
            <div className="flex-1">
              <div className="text-[17px] font-semibold text-fg">{stats.recordExercise || "Record"}</div>
              <div className="text-[15px] text-fg-muted">Meilleur 1RM estimé</div>
            </div>
            <span className="font-oswald text-xl font-bold text-fg">
              {Math.round(stats.recordE1rm)} kg
            </span>
          </div>
        </>
      )}

      {/* Répartition par groupe */}
      {stats.groups.length > 0 && (
        <div className="rounded-card border border-line bg-surface px-4 py-3.5">
          <p className="text-[15px] font-semibold text-fg-muted">Répartition par groupe</p>
          <div className="mt-3 space-y-2.5">
            {stats.groups.map((g) => (
              <div key={g.group}>
                <div className="mb-1 flex justify-between text-[15px] text-fg">
                  <span>{MUSCLE_GROUP_LABELS[g.group] ?? g.group}</span>
                  <span className="font-bold">{g.pct} %</span>
                </div>
                <div className="h-2 rounded-full bg-fg/10">
                  <div className="h-full rounded-full bg-fg/85" style={{ width: `${g.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
