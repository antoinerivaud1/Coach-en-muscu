import Link from "next/link";
import { startSession } from "@/app/seances/actions";
import BottomNav from "@/components/BottomNav";
import MemberAvatar from "@/components/onboarding/MemberAvatar";

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];

export type FirstDaySeance = {
  id: string;
  name: string;
  exerciseCount: number;
};

/**
 * CM-86 : accueil du premier jour (maquette 5), pour un utilisateur sans duo
 * qui n'a encore terminé aucune séance : carte « Aujourd'hui » avec sa
 * première séance, compteur de la semaine, ses séances, un conseil. Aucune
 * section duo. Dès la première séance terminée, l'accueil habituel reprend.
 */
export default function FirstDayHome({
  name,
  accent,
  weeklyGoal,
  todayIdx,
  today,
  todayMinutes,
  seances,
  error,
}: {
  name: string;
  accent: string;
  weeklyGoal: number;
  todayIdx: number;
  today: FirstDaySeance;
  todayMinutes: number;
  seances: FirstDaySeance[];
  error?: string;
}) {
  const plural = (n: number) => `${n} exercice${n > 1 ? "s" : ""}`;

  return (
    <main className="min-h-[100dvh] px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between gap-3">
        <h1 className="min-w-0 truncate text-[28px] font-black tracking-tight text-fg">
          Salut, <span style={{ color: accent }}>{name}</span>
        </h1>
        <MemberAvatar name={name} color={accent} size={44} />
      </header>

      {error && (
        <p role="alert" className="mt-5 rounded-2xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-400">
          {error}
        </p>
      )}

      <section aria-label="Cette semaine" className="mt-[18px] rounded-[20px] border border-line bg-surface px-4 py-3.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-bold uppercase tracking-[0.06em] text-[#A4A4AE]">
            Cette semaine
          </span>
          <span className="font-oswald text-[19px] font-semibold text-fg">
            0<span className="text-fg-muted"> / {weeklyGoal}</span>
          </span>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {WEEK.map((d, i) => (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[13px] font-semibold text-fg-muted">{d}</span>
              <span
                className={`h-[30px] w-[30px] rounded-[10px] ${i === todayIdx ? "border-2" : "bg-surface2"}`}
                style={i === todayIdx ? { borderColor: accent } : undefined}
              />
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Aujourd'hui" className="mt-3.5 flex flex-col gap-3.5 rounded-3xl bg-energy p-5 text-ink">
        <div className="flex flex-col gap-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-extrabold uppercase tracking-[0.08em]">Aujourd&apos;hui</span>
              <span className="break-words font-oswald text-[40px] font-bold uppercase leading-none">
                {today.name}
              </span>
            </div>
            <span className="flex-none rounded-full bg-ink/10 px-2.5 py-1.5 text-sm font-bold">
              1<sup>re</sup>&nbsp;séance
            </span>
          </div>
          <span className="text-base font-semibold">
            {plural(today.exerciseCount)}
            {todayMinutes > 0 && <> · environ&nbsp;{todayMinutes}&nbsp;min</>}
          </span>
        </div>
        <form action={startSession}>
          <input type="hidden" name="day_id" value={today.id} />
          <button
            type="submit"
            className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-ink text-base font-extrabold text-energy"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#CCFF02" aria-hidden>
              <path d="M7 4.5v15l12-7.5-12-7.5Z" />
            </svg>
            Démarrer la séance
          </button>
        </form>
      </section>

      <div className="mt-[22px] flex items-baseline justify-between">
        <h2 className="text-lg font-extrabold text-fg">Tes séances</h2>
        <Link href="/seances" className="inline-flex min-h-11 items-center text-base font-bold text-energy">
          Tout voir
        </Link>
      </div>
      <div className="mt-1 grid grid-cols-3 gap-2">
        {seances.map((s) => (
          <form key={s.id} action={startSession}>
            <input type="hidden" name="day_id" value={s.id} />
            <button
              type="submit"
              disabled={s.exerciseCount === 0}
              className="flex h-full w-full flex-col items-start gap-1 rounded-[18px] border border-line bg-surface px-3 py-3.5 text-left disabled:opacity-50"
            >
              <span className="line-clamp-2 text-base font-extrabold leading-tight text-fg">{s.name}</span>
              <span className="text-sm text-fg-muted">{plural(s.exerciseCount)}</span>
            </button>
          </form>
        ))}
      </div>

      <div className="mt-3.5 flex items-start gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#CCFF02" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-px flex-none" aria-hidden>
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
        </svg>
        <p className="text-[15px] leading-relaxed text-[#C9C9D1]">
          Pour ta première séance, note simplement tes charges. Dès la deuxième, on
          te rappelle ce que tu as fait la dernière fois.
        </p>
      </div>

      <BottomNav />
    </main>
  );
}
