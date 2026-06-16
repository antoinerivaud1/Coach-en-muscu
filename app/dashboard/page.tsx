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

export default async function DashboardPage() {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const profile = await getProfile(supabase, profileId);
  const coupleId = await getCoupleId(supabase, profileId);

  let partnerName: string | null = null;
  if (coupleId) {
    const ids = await getCoupleProfileIds(supabase, coupleId);
    const partnerId = ids.find((id) => id !== profileId);
    if (partnerId) {
      const partner = await getProfile(supabase, partnerId);
      partnerName = partner?.display_name ?? null;
    }
  }

  const colorClass = profile?.color_role === "elle" ? "text-elle" : "text-toi";
  const accentBg = profile?.color_role === "elle" ? "bg-elle" : "bg-toi";

  const { data: programsData } = await getProgramsForUser(
    supabase,
    profileId,
    coupleId,
  );
  const programs: ProgramWithDays[] = (programsData ?? []) as ProgramWithDays[];

  return (
    <main className="min-h-screen p-4 pb-28">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Salut, <span className={colorClass}>{profile?.display_name}</span>
          </h1>
          {partnerName && (
            <p className="mt-1 text-sm text-zinc-400">
              En binôme avec {partnerName}
            </p>
          )}
        </div>
        <form action={clearProfile}>
          <button
            type="submit"
            className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Changer de profil
          </button>
        </form>
      </header>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">Mes programmes</h2>
          {programs.length > 0 && (
            <Link
              href="/programs/new"
              className={`rounded-lg ${accentBg} px-3 py-1 text-sm font-medium text-white`}
            >
              + Nouveau
            </Link>
          )}
        </div>

        {programs.length === 0 ? (
          <div className="rounded-lg bg-zinc-900 p-6 text-center">
            <p className="text-zinc-300">Aucun programme pour l&apos;instant</p>
            <p className="mt-1 text-sm text-zinc-500">
              Crée ton premier programme pour commencer à t&apos;entraîner
            </p>
            <Link
              href="/programs/new"
              className={`mt-4 inline-block rounded-lg ${accentBg} px-5 py-2.5 font-semibold text-white`}
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
                  className="block rounded-lg bg-zinc-900 p-4 transition-colors hover:bg-zinc-800"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{program.name}</span>
                    {program.couple_id && (
                      <span className="rounded-full bg-elle/20 px-2 py-0.5 text-xs font-medium text-elle">
                        Partagé
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-zinc-500">
                    {program.program_days.length}{" "}
                    {program.program_days.length === 1 ? "jour" : "jours"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <BottomNav />
    </main>
  );
}
