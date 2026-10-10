import type { Member } from "@/lib/duo";

export type MemberWeek = Member & {
  /** Jours (0 = lundi) avec au moins une séance terminée. */
  doneDays: number[];
  /** Séances terminées cette semaine. */
  count: number;
  goal: number;
};

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * CM-87 : « Cette semaine » en duo (maquette 10). Une ligne par membre :
 * prénom dans sa couleur, 7 jours, compteur séances / objectif.
 */
export default function DuoWeekCard({
  members,
  todayIdx,
  weekLabel,
}: {
  members: MemberWeek[];
  todayIdx: number;
  weekLabel: string;
}) {
  return (
    <section
      aria-labelledby="cette-semaine"
      className="mt-5 flex flex-col gap-3 rounded-[20px] border border-line bg-surface px-4 py-3.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2
          id="cette-semaine"
          className="text-[15px] font-bold uppercase tracking-[0.06em] text-fg-muted"
        >
          Cette semaine
        </h2>
        <span className="text-sm text-fg-muted">{weekLabel}</span>
      </div>
      {/* Initiales des jours, alignées sur les cases. */}
      <div className="flex items-center gap-2.5" aria-hidden>
        <span className="w-[72px] flex-none" />
        <div className="grid flex-1 grid-cols-7 gap-[5px]">
          {WEEK.map((d, i) => (
            <span
              key={i}
              className={`text-center text-[12px] font-bold ${
                i === todayIdx ? "text-energy" : "text-fg-muted"
              }`}
            >
              {d}
            </span>
          ))}
        </div>
        <span className="w-11 flex-none" />
      </div>
      {members.map((m) => (
        <div key={m.id} className="flex items-center gap-2.5" data-member={m.name}>
          <span
            className="w-[72px] flex-none truncate text-[15px] font-bold"
            style={{ color: m.color }}
          >
            {m.name}
          </span>
          <div className="grid flex-1 grid-cols-7 gap-[5px]">
            {WEEK.map((d, i) => {
              const done = m.doneDays.includes(i);
              return (
                <span
                  key={i}
                  className={`h-[22px] rounded-[7px] ${
                    done ? "" : i === todayIdx ? "border-2 border-[#3A3A44]" : "bg-surface2"
                  }`}
                  style={done ? { background: m.color } : undefined}
                />
              );
            })}
          </div>
          <span
            className="w-11 flex-none text-right font-oswald text-[17px] font-semibold text-fg"
            aria-label={`${m.name} : ${m.count} séance${m.count > 1 ? "s" : ""} sur ${m.goal}`}
          >
            {m.count}
            <span className="text-fg-muted">/{m.goal}</span>
          </span>
        </div>
      ))}
    </section>
  );
}
