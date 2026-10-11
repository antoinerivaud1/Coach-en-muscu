import { test, expect } from "@playwright/test";
import { buildDashboardView, type DashboardData } from "@/lib/data/dashboard";

// CM-88 (PR 4) : calcul pur de l'accueil, ex-page serveur. Aucune base.
// Lancer : npm run test:unit

const ME = "11111111-1111-1111-1111-111111111111";
const PARTNER = "22222222-2222-2222-2222-222222222222";
/** Mercredi 7 octobre 2026, 12 h à Paris. */
const NOW = new Date("2026-10-07T10:00:00.000Z");

function data(over: Partial<DashboardData> = {}): DashboardData {
  return {
    profile: { id: ME, display_name: "Camille", accent_color: "#FF8A3D", weekly_goal: 4 },
    membershipOk: true,
    duoId: null,
    partner: null,
    partnerLive: null,
    currentSession: null,
    sessions: [],
    programs: [
      {
        id: "p1",
        name: "Mes séances",
        duo_id: null,
        program_days: [
          {
            id: "push",
            name: "Push",
            order_index: 0,
            program_exercises: [
              { target_sets: 3, rest_seconds: 90, exercises: { muscle_group: "chest" } },
              { target_sets: 3, rest_seconds: 90, exercises: { muscle_group: "triceps" } },
            ],
          },
        ],
      },
    ],
    partnerSessions: [],
    partnerSets: [],
    exerciseNames: {},
    ...over,
  };
}

/** Séance terminée du lundi 5 octobre, avec ou sans séries. */
function monday(sets: number) {
  return {
    id: `s${sets}`,
    performed_at: "2026-10-05T17:00:00.000Z",
    program_day_id: "push",
    session_sets: Array.from({ length: sets }, (_, i) => ({
      id: `set${i}`,
      exercises: { muscle_group: "chest" as const },
    })),
  };
}

test.describe("buildDashboardView (CM-88)", () => {
  test("solo sans séance terminée : accueil du premier jour, durée estimée", () => {
    const view = buildDashboardView(data(), ME, NOW);
    expect(view.kind).toBe("firstDay");
    if (view.kind !== "firstDay") return;
    expect(view.name).toBe("Camille");
    expect(view.weeklyGoal).toBe(4);
    expect(view.today.id).toBe("push");
    expect(view.todayMinutes).toBeGreaterThan(0);
  });

  test("lecture du duo en échec : jamais l'accueil du premier jour (C3)", () => {
    const view = buildDashboardView(data({ membershipOk: false }), ME, NOW);
    expect(view.kind).toBe("home");
  });

  test("séance en cours récente : bandeau de reprise, pas de premier jour", () => {
    const view = buildDashboardView(
      data({
        currentSession: {
          id: "live",
          performed_at: "2026-10-07T09:30:00.000Z",
          program_days: { name: "Push" },
          session_sets: [],
        },
      }),
      ME,
      NOW,
    );
    expect(view.kind).toBe("home");
    if (view.kind !== "home") return;
    expect(view.banner).toMatchObject({ kind: "banner", sessionId: "live" });
    expect(view.currentDayName).toBe("Push");
  });

  test("une séance terminée sans série ne coche pas le jour (CM-66)", () => {
    const empty = buildDashboardView(data({ sessions: [monday(0), monday(0)] }), ME, NOW);
    // Aucune séance comptée : toujours le premier jour.
    expect(empty.kind).toBe("firstDay");

    const done = buildDashboardView(data({ sessions: [monday(2)] }), ME, NOW);
    expect(done.kind).toBe("home");
    if (done.kind !== "home") return;
    expect(done.doneThisWeek).toEqual([0]);
    expect(done.seances[0]?.lastDoneAt).toBe("2026-10-05T17:00:00.000Z");
    expect(done.duoWeek).toEqual([]);
    expect(done.partnerMember).toBeNull();
  });

  test("duo actif : une ligne par membre et dernier record du partenaire", () => {
    const view = buildDashboardView(
      data({
        duoId: "duo",
        partner: { id: PARTNER, display_name: "Lina", accent_color: "#2FE6FF", weekly_goal: 3 },
        partnerLive: { dayName: "Jambes" },
        sessions: [monday(1)],
        partnerSets: [
          { exercise_id: "squat", weight_kg: 60, reps: 5, session_id: "a", sessions: { performed_at: "2026-10-01T17:00:00.000Z" } },
          { exercise_id: "squat", weight_kg: 65, reps: 5, session_id: "b", sessions: { performed_at: "2026-10-06T17:00:00.000Z" } },
        ],
        exerciseNames: { squat: "Squat" },
      }),
      ME,
      NOW,
    );
    expect(view.kind).toBe("home");
    if (view.kind !== "home") return;
    expect(view.duoWeek.map((m) => m.name)).toEqual(["Camille", "Lina"]);
    expect(view.duoWeek[0]?.count).toBe(1);
    expect(view.partnerLive).toEqual({ dayName: "Jambes" });
    expect(view.partnerRecord?.exerciseName).toBe("Squat");
  });

  test("partenaire illisible : aucune section duo", () => {
    const view = buildDashboardView(
      data({ duoId: "duo", partner: null, partnerLive: { dayName: "Jambes" }, sessions: [monday(1)] }),
      ME,
      NOW,
    );
    expect(view.kind).toBe("home");
    if (view.kind !== "home") return;
    expect(view.duoWeek).toEqual([]);
    expect(view.partnerLive).toBeNull();
  });
});
