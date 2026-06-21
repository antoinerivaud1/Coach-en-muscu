import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  requireProfileId,
  getProfile,
  getCoupleId,
  getCoupleProfileIds,
} from "@/lib/profile";
import { startSession } from "@/app/programs/[id]/actions";
import BottomNav from "@/components/BottomNav";
import { clearProfile } from "@/app/actions";

type DayLite = {
  id: string;
  name: string;
  order_index: number;
  program_name: string;
  couple: boolean;
  exos: number;
  sets: number;
  minutes: number;
  weekdays: number[];
};

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];
const mondayIdx = (d: Date) => (d.getDay() + 6) % 7;

function todayLabel(): string {
  const s = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function DashboardPage() {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const profile = await getProfile(supabase, profileId);
  const coupleId = await getCoupleId(supabase, profileId);
  const isElle = profile?.color_role === "elle";
  const accent = isElle ? "text-elle" : "text-toi";

  let partnerName: string | null = null;
  if (coupleId) {
    const pids = await getCoupleProfileIds(supabase, coupleId);
    const partnerId = pids.find((id) => id !== profileId);
    if (partnerId) partnerName = (await getProfile(supabase, partnerId))?.display_name ?? null;
  }

  // --- Séances du profil (compteur global + assiduité de la semaine) ---
  const { data: sessRows } = await supabase
    .from("sessions")
    .select("performed_at")
    .eq("profile_id", profileId)
    .order("performed_at", { ascending: false })
    .returns<{ performed_at: string }[]>();
  const sessions = sessRows ?? [];
  const sessionCount = sessions.length;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - mondayIdx(now));
  const doneThisWeek = new Set<number>();
  for (const s of sessions) {
    const d = new Date(s.performed_at);
    if (d >= weekStart) doneThisWeek.add(mondayIdx(d));
  }
  const todayIdx = mondayIdx(now);

  // --- Programmes (jours + estimations) ---
  let q = supabase
    .from("programs")
    .select(
      "id, name, couple_id, owner_profile_id, created_at, program_days(id, name, order_index, weekdays, program_exercises(target_sets, rest_seconds))",
    )
    .order("created_at", { ascending: true });
  q = coupleId
    ? q.or(`owner_profile_id.eq.${profileId},couple_id.eq.${coupleId}`)
    : q.eq("owner_profile_id", profileId);
  const { data: progData } = await q.returns<
    {
      id: string;
      name: string;
      couple_id: string | null;
      program_days: {
        id: string;
        name: string;
        order_index: number;
        weekdays: number[];
        program_exercises: { target_sets: number; rest_seconds: number }[];
      }[];
    }[]
  >();

  const days: DayLite[] = [];
  for (const prog of progData ?? []) {
    const ordered = [...(prog.program_days ?? [])].sort(
      (a, b) => a.order_index - b.order_index,
    );
    for (const d of ordered) {
      const pes = d.program_exercises ?? [];
      const sets = pes.reduce((n, e) => n + (e.target_sets || 0), 0);
      const minutes = Math.max(
        15,
        Math.round(
          pes.reduce((n, e) => n + (e.target_sets || 0) * ((e.rest_seconds || 60) + 40), 0) / 60,
        ),
      );
      days.push({
        id: d.id,
        name: d.name,
        order_index: d.order_index,
        weekdays: d.weekdays ?? [],
        program_name: prog.name,
        couple: prog.couple_id !== null,
        exos: pes.length,
        sets,
        minutes,
      });
    }
  }

  const DAY_FR = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
  const hasSchedule = days.some((d) => d.weekdays.length > 0);
  let today: DayLite | null = null;
  let upcoming: { day: DayLite; label: string }[] = [];
  if (hasSchedule) {
    today = days.find((d) => d.weekdays.includes(todayIdx)) ?? null;
    for (let k = 1; k <= 7 && upcoming.length < 2; k++) {
      const wd = (todayIdx + k) % 7;
      const d = days.find((x) => x.weekdays.includes(wd));
      if (d) upcoming.push({ day: d, label: k === 1 ? "Demain" : DAY_FR[wd]! });
    }
  } else if (days.length > 0) {
    today = days[sessionCount % days.length]!;
    if (days.length > 1) {
      upcoming = [1, 2].map((k) => {
        const d = days[(sessionCount + k) % days.length]!;
        return { day: d, label: d.program_name };
      });
    }
  }
  const restToday = hasSchedule && !today;

  return (
    <main className="min-h-[100dvh] px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold tracking-wide text-fg-muted">
            {todayLabel()}
          </div>
          <h1 className="mt-1 text-[30px] font-black tracking-tight text-fg">
            Salut, <span className={accent}>{profile?.display_name}</span>
          </h1>
          {partnerName && (
            <p className="mt-1 text-sm text-fg-muted">En binôme avec {partnerName}</p>
          )}
        </div>
        <span
          className={`flex h-[46px] w-[46px] items-center justify-center rounded-2xl border font-oswald text-xl font-bold ${
            isElle ? "border-elle/40 bg-elle/10 text-elle" : "border-toi/40 bg-toi/10 text-toi"
          }`}
          aria-hidden
        >
          {isElle ? "E" : "L"}
        </span>
      </header>

      {/* Strip de la semaine */}
      <div className="mt-6 flex justify-between gap-1.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
        {WEEK.map((d, i) => {
          const done = doneThisWeek.has(i);
          const isToday = i === todayIdx;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span
                className={`text-[10px] font-bold ${isToday ? "text-energy" : "text-fg-muted"}`}
              >
                {d}
              </span>
              <span
                className={`h-6 w-6 rounded-lg ${
                  done
                    ? "bg-energy"
                    : isToday
                      ? "border-2 border-energy bg-transparent"
                      : "bg-surface2"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Carte Aujourd'hui */}
      {today ? (
        <>
          <p className="mb-2.5 ml-0.5 mt-6 text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
            Aujourd&apos;hui
          </p>
          <div className="relative overflow-hidden rounded-3xl border border-energy/25 bg-[linear-gradient(150deg,#1c2208,#16161c_60%)] p-[22px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-energy/30 bg-energy/15 px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-energy">
              Jour {sessionCount + 1} · {today.program_name}
            </span>
            <h2 className="mt-3.5 text-[30px] font-black leading-none tracking-tight text-fg">
              {today.name}
            </h2>
            <div className="my-[18px] flex items-stretch gap-5">
              {[
                [today.minutes, "min"],
                [today.exos, "exos"],
                [today.sets, "séries"],
              ].map(([v, u], i) => (
                <div key={i} className="flex items-center gap-5">
                  {i > 0 && <span className="w-px self-stretch bg-white/10" />}
                  <div className="font-oswald text-2xl font-bold text-fg">
                    {v}
                    <span className="text-[13px] font-semibold text-fg-muted"> {u}</span>
                  </div>
                </div>
              ))}
            </div>
            <form action={startSession}>
              <input type="hidden" name="day_id" value={today.id} />
              <button
                type="submit"
                disabled={today.exos === 0}
                className="flex w-full items-center justify-center gap-2 rounded-[15px] bg-energy py-4 text-base font-extrabold text-ink disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-[18px] w-[18px]" aria-hidden>
                  <path d="M6 4v16l13-8z" />
                </svg>
                Démarrer la séance
              </button>
            </form>
          </div>
        </>
      ) : restToday ? (
        <>
          <p className="mb-2.5 ml-0.5 mt-6 text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
            Aujourd&apos;hui
          </p>
          <div className="rounded-3xl border border-line bg-surface p-[22px]">
            <h2 className="text-[26px] font-black tracking-tight text-fg">Repos</h2>
            <p className="mt-1 text-sm text-fg-muted">
              Aucune séance planifiée aujourd&apos;hui. Profites-en pour récupérer.
            </p>
          </div>
        </>
      ) : (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-fg">Aucun programme pour l&apos;instant</p>
          <p className="mt-1 text-sm text-fg-muted">
            Crée ton premier programme pour commencer à t&apos;entraîner
          </p>
          <Link
            href="/programs/new"
            className="mt-4 inline-block rounded-xl bg-energy px-5 py-2.5 font-extrabold text-ink"
          >
            Créer mon premier programme
          </Link>
        </div>
      )}

      {/* À venir */}
      {upcoming.length > 0 && (
        <>
          <p className="mb-2.5 ml-0.5 mt-6 text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
            À venir
          </p>
          <div className="flex flex-col gap-2.5">
            {upcoming.map(({ day, label }, i) => (
              <div
                key={`${day.id}-${i}`}
                className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5"
              >
                <span className={`h-2.5 w-2.5 flex-none rounded-full ${i === 0 ? "bg-toi" : "bg-flame"}`} />
                <div className="flex-1">
                  <div className="font-extrabold text-fg">{day.name}</div>
                  <div className="mt-0.5 text-xs font-semibold text-fg-muted">
                    {label} · {day.exos} exercices
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Mes programmes (accès complet) */}
      <div className="mt-7 flex items-center justify-between">
        <Link href="/programs/new" className="text-sm font-semibold text-energy">
          + Nouveau programme
        </Link>
        <form action={clearProfile}>
          <button
            type="submit"
            className="text-sm font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Changer de profil
          </button>
        </form>
      </div>

      <BottomNav />
    </main>
  );
}
