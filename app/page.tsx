import { createClient } from "@/lib/supabase/server";
import { getAllProfiles } from "@/lib/profile";
import { selectProfile } from "./actions";

function DumbbellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m6.5 6.5 11 11" />
      <path d="m21 21-1-1" />
      <path d="m3 3 1 1" />
      <path d="m18 22 4-4" />
      <path d="m2 6 4-4" />
      <path d="m3 10 7-7" />
      <path d="m14 21 7-7" />
    </svg>
  );
}

function FlameIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 2c1 3-1 4-1 6 2 0 4-1 5-3 1 4 3 5 3 9a8 8 0 1 1-15-1c1-2 3-3 4-6 1 1 2 2 4 2-1-3-2-5 0-7Z" />
    </svg>
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function computeStreak(dates: string[]): number {
  const set = new Set(dates);
  const cursor = new Date();
  // La streak reste vivante jusqu'à la fin de la journée : on tolère
  // de démarrer la veille si aujourd'hui n'a pas encore de séance.
  if (!set.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(dayKey(cursor))) return 0;
  }
  let n = 0;
  while (set.has(dayKey(cursor))) {
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export default async function Home() {
  const supabase = await createClient();
  const profiles = await getAllProfiles(supabase);
  const ordered = [...profiles].sort((a, b) =>
    a.color_role === "elle" ? 1 : b.color_role === "elle" ? -1 : 0,
  );
  const ids = ordered.map((p) => p.id);

  // Streak par profil (jours consécutifs avec séance)
  const streakByProfile: Record<string, number> = {};
  // Split par profil (noms des jours de programme)
  const splitByProfile: Record<string, string> = {};

  if (ids.length > 0) {
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const { data: sessRows } = await supabase
      .from("sessions")
      .select("profile_id, performed_at")
      .in("profile_id", ids)
      .gte("performed_at", since.toISOString())
      .returns<{ profile_id: string; performed_at: string }[]>();

    const datesByProfile: Record<string, string[]> = {};
    for (const r of sessRows ?? []) {
      (datesByProfile[r.profile_id] ??= []).push(dayKey(new Date(r.performed_at)));
    }
    for (const p of ordered) {
      streakByProfile[p.id] = computeStreak(datesByProfile[p.id] ?? []);
    }

    const { data: progRows } = await supabase
      .from("programs")
      .select("owner_profile_id, couple_id, program_days(name)")
      .returns<
        {
          owner_profile_id: string | null;
          couple_id: string | null;
          program_days: { name: string }[];
        }[]
      >();
    for (const p of ordered) {
      const names: string[] = [];
      for (const prog of progRows ?? []) {
        const mine = prog.owner_profile_id === p.id || prog.couple_id !== null;
        if (!mine) continue;
        for (const d of prog.program_days ?? []) {
          if (d.name && !names.includes(d.name)) names.push(d.name);
        }
      }
      splitByProfile[p.id] = names.slice(0, 3).join(" · ");
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pb-7 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        {/* Wordmark */}
        <div className="mt-2 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-energy">
            <DumbbellIcon className="h-5 w-5 text-ink" />
          </span>
          <span className="font-oswald text-sm font-bold uppercase tracking-[0.22em] text-fg">
            Coach en Muscu
          </span>
        </div>

        {/* Titre */}
        <h1 className="mt-6 text-[40px] font-black leading-[0.95] tracking-tight text-fg">
          Qui s&apos;entraîne<span className="text-energy">&nbsp;?</span>
        </h1>
        <p className="mt-3 text-sm leading-snug text-fg-muted">
          Touche une photo pour commencer — pas de mot de passe.
        </p>

        {/* Cartes profil */}
        <div className="mt-5 flex flex-1 flex-col gap-3.5 pb-1">
          {ordered.map((p) => {
            const isElle = p.color_role === "elle";
            const label = isElle ? "Elle" : "Lui";
            const initial = isElle ? "E" : "L";
            const streak = streakByProfile[p.id] ?? 0;
            const split = splitByProfile[p.id] ?? "";
            return (
              <form key={p.id} action={selectProfile} className="flex flex-1">
                <input type="hidden" name="profile_id" value={p.id} />
                <button
                  type="submit"
                  className={`group relative w-full flex-1 overflow-hidden rounded-[26px] border text-left transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99] ${
                    isElle
                      ? "border-elle/30 bg-[radial-gradient(circle_at_70%_22%,#4a1530,#1c0a13)] hover:border-elle/70"
                      : "border-toi/30 bg-[radial-gradient(circle_at_70%_22%,#0e4452,#08151b)] hover:border-toi/70"
                  }`}
                >
                  {/* Lettre fantôme */}
                  <span
                    className={`pointer-events-none absolute right-3 top-0 font-oswald text-[150px] font-bold leading-none ${
                      isElle ? "text-elle/10" : "text-toi/10"
                    }`}
                  >
                    {initial}
                  </span>

                  {/* Badge rôle */}
                  <span
                    className={`absolute left-[18px] top-4 rounded-full border px-[11px] py-[5px] text-[10px] font-extrabold uppercase tracking-[0.12em] ${
                      isElle
                        ? "border-elle/30 bg-elle/15 text-elle"
                        : "border-toi/30 bg-toi/15 text-toi"
                    }`}
                  >
                    {label}
                  </span>

                  {/* Bas de carte */}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent p-[18px]">
                    <span className="block text-[26px] font-black leading-none tracking-tight text-fg">
                      {p.display_name}
                    </span>
                    <span className="mt-2.5 flex items-center gap-1.5">
                      {streak > 0 && (
                        <>
                          <FlameIcon className="h-3.5 w-3.5 text-flame" />
                          <span className="font-oswald text-[13px] font-semibold text-flame">
                            {streak} {streak > 1 ? "jours" : "jour"}
                          </span>
                        </>
                      )}
                      {streak > 0 && split && (
                        <span className="h-[3px] w-[3px] rounded-full bg-fg-faint" />
                      )}
                      {split ? (
                        <span className="truncate text-xs font-semibold text-fg/80">
                          {split}
                        </span>
                      ) : (
                        streak === 0 && (
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
                            Démarrer la séance
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className={`h-4 w-4 ${isElle ? "text-elle" : "text-toi"}`}
                              aria-hidden
                            >
                              <path d="m9 18 6-6-6-6" />
                            </svg>
                          </span>
                        )
                      )}
                    </span>
                  </span>
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </main>
  );
}
