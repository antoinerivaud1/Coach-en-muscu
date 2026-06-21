import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProgramsForUser } from "@/lib/queries/programs";
import type { ProgramWithDays } from "@/lib/queries/programs";
import {
  requireProfileId,
  getProfile,
  getCoupleId,
  getCoupleProfileIds,
} from "@/lib/profile";
import BottomNav from "@/components/BottomNav";
import { clearProfile } from "@/app/actions";

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

  let partnerName: string | null = null;
  if (coupleId) {
    const ids = await getCoupleProfileIds(supabase, coupleId);
    const partnerId = ids.find((id) => id !== profileId);
    if (partnerId) {
      const partner = await getProfile(supabase, partnerId);
      partnerName = partner?.display_name ?? null;
    }
  }

  const colorClass = isElle ? "text-elle" : "text-toi";

  const { data: programsData } = await getProgramsForUser(
    supabase,
    profileId,
    coupleId,
  );
  const programs: ProgramWithDays[] = (programsData ?? []) as ProgramWithDays[];

  return (
    <main className="min-h-[100dvh] px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold tracking-wide text-fg-muted">
            {todayLabel()}
          </div>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-fg">
            Salut, <span className={colorClass}>{profile?.display_name}</span>
          </h1>
          {partnerName && (
            <p className="mt-1 text-sm text-fg-muted">En binôme avec {partnerName}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex h-11 w-11 items-center justify-center rounded-2xl border font-oswald text-lg font-bold ${
              isElle
                ? "border-elle/40 bg-elle/10 text-elle"
                : "border-toi/40 bg-toi/10 text-toi"
            }`}
            aria-hidden
          >
            {isElle ? "E" : "L"}
          </span>
        </div>
      </header>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
            Mes programmes
          </h2>
          {programs.length > 0 && (
            <Link
              href="/programs/new"
              className="rounded-xl bg-energy px-3 py-1.5 text-sm font-extrabold text-ink"
            >
              + Nouveau
            </Link>
          )}
        </div>

        {programs.length === 0 ? (
          <div className="rounded-2xl border border-line bg-surface p-6 text-center">
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
        ) : (
          <ul className="space-y-3">
            {programs.map((program) => (
              <li key={program.id}>
                <Link
                  href={`/programs/${program.id}`}
                  className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-white/20"
                >
                  <span
                    className={`h-2.5 w-2.5 flex-none rounded-full ${
                      program.couple_id ? "bg-elle" : "bg-toi"
                    }`}
                    aria-hidden
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-fg">{program.name}</span>
                      {program.couple_id && (
                        <span className="rounded-full bg-elle/15 px-2 py-0.5 text-xs font-medium text-elle">
                          Partagé
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-fg-muted">
                      {program.program_days.length}{" "}
                      {program.program_days.length === 1 ? "jour" : "jours"}
                    </p>
                  </div>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-5 w-5 flex-none text-fg-faint"
                    aria-hidden
                  >
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <form action={clearProfile} className="mt-6">
          <button
            type="submit"
            className="text-sm font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Changer de profil
          </button>
        </form>
      </section>
      <BottomNav />
    </main>
  );
}
