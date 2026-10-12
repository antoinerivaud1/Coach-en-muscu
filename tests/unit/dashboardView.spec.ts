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
    doneSessions: [],
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

  test("séance vide ouverte depuis plus de 2 h : abandonnée, aucun bandeau", () => {
    const view = buildDashboardView(
      data({
        sessions: [monday(1)],
        currentSession: {
          id: "vide",
          performed_at: "2026-10-07T07:30:00.000Z",
          program_days: { name: "Push" },
          session_sets: [],
        },
      }),
      ME,
      NOW,
    );
    expect(view.kind).toBe("home");
    if (view.kind !== "home") return;
    expect(view.banner).toEqual({ kind: "abandoned", sessionId: "vide" });
  });

  test("frontière de fuseau : dimanche 23 h UTC est déjà lundi à Paris", () => {
    // Lundi 12 octobre, 1 h à Paris.
    const now = new Date("2026-10-11T23:00:00.000Z");
    const at = (iso: string) => ({ ...monday(1), id: iso, performed_at: iso });
    const view = buildDashboardView(
      data({
        sessions: [
          // Dimanche 22 h à Paris : semaine précédente.
          at("2026-10-11T20:00:00.000Z"),
          // Lundi 0 h 30 à Paris : cette semaine, lundi.
          at("2026-10-11T22:30:00.000Z"),
        ],
      }),
      ME,
      now,
    );
    expect(view.kind).toBe("home");
    if (view.kind !== "home") return;
    expect(view.todayIdx).toBe(0);
    expect(view.doneThisWeek).toEqual([0]);
  });

  test("suggestion masquée quand le bandeau de reprise est affiché", () => {
    const legs = {
      id: "legs",
      name: "Jambes",
      order_index: 1,
      program_exercises: [
        { target_sets: 3, rest_seconds: 90, exercises: { muscle_group: "quads" as const } },
      ],
    };
    const base = data();
    const programs = [{ ...base.programs[0]!, program_days: [...base.programs[0]!.program_days, legs] }];
    const sessions = [monday(2), { ...monday(3), performed_at: "2026-10-03T17:00:00.000Z" }];

    const idle = buildDashboardView(data({ programs, sessions }), ME, NOW);
    if (idle.kind !== "home") throw new Error("accueil attendu");
    expect(idle.recommended).not.toBeNull();

    const live = buildDashboardView(
      data({
        programs,
        sessions,
        currentSession: {
          id: "live",
          performed_at: "2026-10-07T09:30:00.000Z",
          program_days: { name: "Push" },
          session_sets: [{ created_at: "2026-10-07T09:40:00.000Z" }],
        },
      }),
      ME,
      NOW,
    );
    if (live.kind !== "home") throw new Error("accueil attendu");
    expect(live.banner.kind).toBe("banner");
    expect(live.recommended).toBeNull();
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

  test("CM-89 (PR 0) : une séance ancienne hors fenêtre compte encore (dernière fois, pas de premier jour)", () => {
    const old = { id: "old", program_day_id: "push", performed_at: "2026-08-03T17:00:00.000Z" };
    const view = buildDashboardView(data({ doneSessions: [old] }), ME, NOW);
    expect(view.kind).toBe("home");
    if (view.kind !== "home") return;
    expect(view.seances.find((c) => c.id === "push")?.lastDoneAt).toBe(old.performed_at);
    // Hors de la semaine : rien de coché dans le strip.
    expect(view.doneThisWeek).toEqual([]);
  });

  test("CM-89 (PR 0) : une séance présente dans les deux lectures ne compte qu'une fois", () => {
    const recent = monday(2);
    const light = { id: recent.id, program_day_id: "push", performed_at: recent.performed_at };
    // Deux séances types démarrables : la suggestion ne dépend plus que du
    // nombre de séances enregistrées.
    const base = data();
    const pull = {
      ...base.programs[0]!.program_days[0]!,
      id: "pull",
      name: "Pull",
      order_index: 1,
    };
    const programs = [{ ...base.programs[0]!, program_days: [...base.programs[0]!.program_days, pull] }];
    const once = buildDashboardView(
      data({ programs, sessions: [recent], doneSessions: [light] }),
      ME,
      NOW,
    );
    const twice = buildDashboardView(
      data({ programs, sessions: [recent], doneSessions: [light, { ...light, id: "autre" }] }),
      ME,
      NOW,
    );
    // Une seule séance : pas de suggestion (MIN_HISTORY = 2) ; deux : suggestion.
    expect(once.kind === "home" && once.recommended).toBeFalsy();
    expect(twice.kind === "home" && twice.recommended).toBeTruthy();
  });
});
