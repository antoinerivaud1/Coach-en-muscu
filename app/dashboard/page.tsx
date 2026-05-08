import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";
import { getProgramsForUser } from "@/lib/queries/programs";
import type { ProgramWithDays } from "@/lib/queries/programs";

type ColorRole = "toi" | "elle";

type ProfileRow = {
  display_name: string;
  color_role: ColorRole;
};

type MemberRow = {
  couple_id: string;
};

type PartnerRow = {
  profile_id: string;
  profiles: ProfileRow | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const profileResult = await supabase
    .from("profiles")
    .select("display_name, color_role")
    .eq("id", user.id)
    .returns<ProfileRow[]>()
    .maybeSingle();
  const profile = profileResult.data;

  const memberResult = await supabase
    .from("couple_members")
    .select("couple_id")
    .eq("profile_id", user.id)
    .returns<MemberRow[]>()
    .maybeSingle();
  const member = memberResult.data;

  if (!member) {
    redirect("/onboarding");
  }

  const coupleId = member.couple_id;

  const partnersResult = await supabase
    .from("couple_members")
    .select("profile_id, profiles ( display_name, color_role )")
    .eq("couple_id", coupleId)
    .neq("profile_id", user.id)
    .returns<PartnerRow[]>();

  const firstPartner = partnersResult.data?.[0];
  const partner = firstPartner?.profiles ?? null;

  const colorClass =
    profile?.color_role === "elle" ? "text-elle" : "text-toi";

  const { data: programsData } = await getProgramsForUser(
    supabase,
    user.id,
    coupleId,
  );
  const programs: ProgramWithDays[] = (programsData ?? []) as ProgramWithDays[];

  return (
    <main className="min-h-screen p-4">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Salut, <span className={colorClass}>{profile?.display_name}</span>
          </h1>
          {partner ? (
            <p className="mt-1 text-sm text-zinc-400">
              En binome avec {partner.display_name}
            </p>
          ) : (
            <div className="mt-2 rounded-lg bg-zinc-900 p-3 text-sm">
              <p className="text-zinc-400">Code couple a partager :</p>
              <code className="mt-1 block break-all font-mono text-xs text-zinc-200">
                {coupleId}
              </code>
            </div>
          )}
        </div>
        <form action={signOut}>
          <button
            type="submit"
            className="rounded-lg bg-zinc-800 px-3 py-1 text-sm text-zinc-300 hover:bg-zinc-700"
          >
            Deconnexion
          </button>
        </form>
      </header>

      {/* Programs section */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-200">Mes programmes</h2>
          {programs.length > 0 && (
            <Link
              href="/programs/new"
              className="rounded-lg bg-toi px-3 py-1 text-sm font-medium text-white"
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
              className="mt-4 inline-block rounded-lg bg-toi px-5 py-2.5 font-semibold text-white"
            >
              Créer mon premier programme
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {programs.map((program) => (
              <li key={program.id}>
                <span
                  className="block cursor-not-allowed rounded-lg bg-zinc-900 p-4 opacity-80"
                  title="Page programme bientôt disponible"
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
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
