import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/auth/actions";

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

      <section className="mt-8 rounded-lg bg-zinc-900 p-6 text-center">
        <p className="text-zinc-300">Phase 1 Foundation : OK</p>
        <p className="mt-2 text-sm text-zinc-500">
          Prochaine etape : creer ton premier programme (Phase 2)
        </p>
      </section>
    </main>
  );
}
