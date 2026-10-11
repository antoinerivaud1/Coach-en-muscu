import { test, expect } from "@playwright/test";
import { buildSeries, buildStats } from "@/lib/data/progress";
import type { Member } from "@/lib/duo";
import type { ProgressRow } from "@/lib/queries/sessions";

// CM-88 : calculs de l'écran Stats, sortis de l'ancienne page serveur sans
// changement. Tests purs : aucun navigateur, aucune donnée Supabase.

const NOW = new Date(2026, 9, 14, 12); // mercredi 14 octobre 2026, midi (heure locale)

function row(
  exercise_id: string,
  session_id: string,
  performed_at: string,
  weight_kg: number,
  reps: number,
): ProgressRow {
  return { exercise_id, session_id, weight_kg, reps, sessions: { performed_at } };
}

const MONDAY = new Date(2026, 9, 12, 18).toISOString();
const LAST_MONTH = new Date(2026, 8, 20, 18).toISOString();

const SETS: ProgressRow[] = [
  row("bench", "s1", LAST_MONTH, 60, 8),
  row("bench", "s2", MONDAY, 62.5, 8),
  row("bench", "s2", MONDAY, 70, 3),
  row("squat", "s2", MONDAY, 100, 5),
];

const ME: Member = { id: "me", name: "Théo", color: "#2FE6FF", isMe: true };
const PARTNER: Member = { id: "p", name: "Lina", color: "#FF4F7E", isMe: false };

test("courbes : une valeur par séance, triées par date, exercice le plus suivi d'abord", () => {
  const series = buildSeries(SETS, { bench: "Développé couché", squat: "Squat" });
  expect(series.map((s) => s.name)).toEqual(["Développé couché", "Squat"]);
  expect(series[0]!.points.map((p) => p.topWeight)).toEqual([60, 70]);
  expect(series[1]!.points).toHaveLength(1);
});

test("stats solo : mois, volume, record, objectif hebdo, aucune comparaison", () => {
  const stats = buildStats({
    allSets: SETS,
    names: { bench: "Développé couché", squat: "Squat" },
    muscleByEx: { bench: "chest", squat: "quads" },
    weekGoal: 3,
    selectedProfileId: "me",
    members: [ME],
    weekSessions: [{ id: "s2", profile_id: "me", performed_at: MONDAY }],
    weekSetSessionIds: [],
    now: NOW,
  });
  expect(stats.sessionsThisMonth).toBe(1);
  expect(stats.sessionsDelta).toBe(0);
  expect(stats.totalSets).toBe(4);
  expect(stats.totalVolumeKg).toBe(60 * 8 + 62.5 * 8 + 70 * 3 + 100 * 5);
  expect(stats.recordExercise).toBe("Squat");
  expect(stats.weekGoal).toBe(3);
  expect(stats.weekSessions).toBe(1);
  expect(stats.weeks).toHaveLength(6);
  expect(stats.weeks[5]!.volume).toBe(62.5 * 8 + 70 * 3 + 100 * 5);
  expect(stats.couple).toEqual([]);
});

test("stats en duo actif : séries de la semaine comptées par membre", () => {
  const stats = buildStats({
    allSets: SETS,
    names: {},
    muscleByEx: {},
    weekGoal: 4,
    selectedProfileId: "me",
    members: [ME, PARTNER],
    weekSessions: [
      { id: "s2", profile_id: "me", performed_at: MONDAY },
      { id: "s3", profile_id: "p", performed_at: MONDAY },
    ],
    weekSetSessionIds: ["s2", "s2", "s3"],
    now: NOW,
  });
  expect(stats.weekSessions).toBe(1);
  expect(stats.couple).toEqual([
    { name: "Théo", color: "#2FE6FF", sets: 2 },
    { name: "Lina", color: "#FF4F7E", sets: 1 },
  ]);
});
