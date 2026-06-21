import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getProfile, getCoupleId, getCoupleProfileIds } from "@/lib/profile";
import { clearProfile, updateWeeklyGoal } from "@/app/actions";
import BottomNav from "@/components/BottomNav";
import OnboardingPhoto from "@/components/OnboardingPhoto";
import { getBadges } from "@/lib/badges";

function Row({ href, title, sub }: { href: string; title: string; sub: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 transition-colors hover:border-white/20"
    >
      <div className="flex-1">
        <div className="font-extrabold text-fg">{title}</div>
        <div className="mt-0.5 text-xs font-semibold text-fg-muted">{sub}</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none text-fg-faint" aria-hidden>
        <path d="m9 18 6-6-6-6" />
      </svg>
    </Link>
  );
}

export default async function ProfilePage() {
  const profileId = await requireProfileId();
  const supabase = await createClient();
  const profile = await getProfile(supabase, profileId);
  const isElle = profile?.color_role === "elle";
  const { badges, earnedCount } = await getBadges(
    supabase,
    profileId,
    profile?.weekly_goal ?? 4,
  );

  const coupleId = await getCoupleId(supabase, profileId);
  let partnerName: string | null = null;
  if (coupleId) {
    const ids = await getCoupleProfileIds(supabase, coupleId);
    const partnerId = ids.find((id) => id !== profileId);
    if (partnerId) partnerName = (await getProfile(supabase, partnerId))?.display_name ?? null;
  }

  return (
    <main className="min-h-[100dvh] px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="text-[30px] font-black tracking-tight text-fg">Profil</h1>

      <div className="mt-5 flex items-center gap-4 rounded-3xl border border-line bg-surface p-5">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-2xl border font-oswald text-2xl font-bold ${
            isElle ? "border-elle/40 bg-elle/10 text-elle" : "border-toi/40 bg-toi/10 text-toi"
          }`}
          aria-hidden
        >
          {isElle ? "E" : "L"}
        </span>
        <div>
          <div className="text-xl font-black text-fg">{profile?.display_name}</div>
          {partnerName && (
            <div className="mt-0.5 text-sm text-fg-muted">En binôme avec {partnerName}</div>
          )}
        </div>
      </div>

      <OnboardingPhoto />

      <div className="mt-6 rounded-2xl border border-line bg-surface p-4">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-fg-muted">
          Objectif hebdomadaire
        </div>
        <p className="mt-1 text-sm text-fg-muted">
          Nombre de séances visées par semaine (anneau des Stats).
        </p>
        <div className="mt-3 flex gap-2">
          {[3, 4, 5, 6].map((g) => {
            const active = (profile?.weekly_goal ?? 4) === g;
            return (
              <form key={g} action={updateWeeklyGoal} className="flex-1">
                <input type="hidden" name="weekly_goal" value={g} />
                <button
                  type="submit"
                  className={`w-full rounded-xl py-2.5 font-oswald text-lg font-bold ${
                    active ? "bg-energy text-ink" : "bg-surface2 text-fg-muted"
                  }`}
                >
                  {g}
                </button>
              </form>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
            Badges
          </p>
          <span className="text-xs font-semibold text-fg-muted">
            {earnedCount}/{badges.length}
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {badges.map((b) => (
            <div
              key={b.id}
              className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center ${
                b.earned ? "border-energy/40 bg-energy/10" : "border-line bg-surface opacity-60"
              }`}
            >
              <span className="text-2xl">{b.icon}</span>
              <span className={`text-[11px] font-bold leading-tight ${b.earned ? "text-fg" : "text-fg-muted"}`}>
                {b.label}
              </span>
              <span className="text-[10px] text-fg-faint">{b.detail}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2.5">
        <Row href="/guide" title="Guide des exercices" sub="Mouvements, erreurs à éviter, étirements" />
        <Row href="/programs/new" title="Nouveau programme" sub="Créer un programme d'entraînement" />
      </div>

      <form action={clearProfile} className="mt-6">
        <button
          type="submit"
          className="w-full rounded-2xl border border-line bg-surface2 py-3.5 text-sm font-bold text-fg active:bg-white/10"
        >
          Changer de profil
        </button>
      </form>

      <BottomNav />
    </main>
  );
}
