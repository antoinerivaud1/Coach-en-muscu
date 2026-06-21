import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

export type Badge = {
  id: string;
  label: string;
  icon: string;
  earned: boolean;
  detail: string;
};

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function computeStreak(dates: string[]): number {
  const set = new Set(dates);
  const cursor = new Date();
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

/** Calcule les badges d'un profil à partir de ses séances (aucune table dédiée). */
export async function getBadges(
  supabase: SupabaseClient<Database>,
  profileId: string,
  weeklyGoal: number,
): Promise<{ badges: Badge[]; earnedCount: number; streak: number }> {
  const { data: sessData } = await supabase
    .from("sessions")
    .select("id, performed_at")
    .eq("profile_id", profileId)
    .returns<{ id: string; performed_at: string }[]>();
  const sessions = sessData ?? [];
  const sessionCount = sessions.length;
  const ids = sessions.map((s) => s.id);

  let totalVolume = 0;
  if (ids.length > 0) {
    const { data: setsData } = await supabase
      .from("session_sets")
      .select("weight_kg, reps, is_warmup, session_id")
      .in("session_id", ids)
      .returns<{ weight_kg: number; reps: number; is_warmup: boolean }[]>();
    for (const s of setsData ?? []) {
      if (!s.is_warmup) totalVolume += s.weight_kg * s.reps;
    }
  }

  const streak = computeStreak(
    sessions.map((s) => dayKey(new Date(s.performed_at))),
  );

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((now.getDay() + 6) % 7));
  const weekSessions = sessions.filter(
    (s) => new Date(s.performed_at) >= weekStart,
  ).length;

  const tonnes = totalVolume / 1000;
  const mk = (
    id: string,
    label: string,
    icon: string,
    earned: boolean,
    detail: string,
  ): Badge => ({ id, label, icon, earned, detail });

  const badges: Badge[] = [
    mk("sess10", "10 séances", "🏋️", sessionCount >= 10, `${sessionCount}/10`),
    mk("sess50", "50 séances", "🏋️", sessionCount >= 50, `${sessionCount}/50`),
    mk("sess100", "100 séances", "🏋️", sessionCount >= 100, `${sessionCount}/100`),
    mk("vol10", "10 tonnes", "🏆", tonnes >= 10, `${tonnes.toFixed(1)} T`),
    mk("vol50", "50 tonnes", "🏆", tonnes >= 50, `${tonnes.toFixed(1)} T`),
    mk("vol100", "100 tonnes", "🏆", tonnes >= 100, `${tonnes.toFixed(1)} T`),
    mk("streak3", "3 jours d'affilée", "🔥", streak >= 3, `${streak} j`),
    mk("streak7", "7 jours d'affilée", "🔥", streak >= 7, `${streak} j`),
    mk(
      "goal",
      "Semaine parfaite",
      "⭐",
      weeklyGoal > 0 && weekSessions >= weeklyGoal,
      `${weekSessions}/${weeklyGoal}`,
    ),
  ];

  return {
    badges,
    earnedCount: badges.filter((b) => b.earned).length,
    streak,
  };
}
