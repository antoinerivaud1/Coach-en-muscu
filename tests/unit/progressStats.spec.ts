import { test, expect } from "@playwright/test";
import {
  buildSeries,
  buildStats,
  filterSinceMonday,
  localMonthIndex,
  mondayDayNumber,
  pickSelectedProfile,
} from "@/lib/data/progress";
import { toMembers, type Member } from "@/lib/duo";
import type { ProgressRow } from "@/lib/queries/sessions";
import { localDayNumber } from "@/lib/utils/recommendation";
import { formatDateLong, formatDateShort } from "@/lib/utils/training";

// CM-88 : calculs de l'écran Stats, sortis de l'ancienne page serveur. Le
// calendrier est celui de Paris (`APP_TIME_ZONE`), quel que soit le fuseau de
// la machine : instants fixés en UTC, résultats attendus en heure de Paris.
// À lancer aussi sous TZ=UTC et TZ=America/Los_Angeles.

/** Numéro de jour d'une date civile (même convention que `localDayNumber`). */
const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

// Heure d'été (UTC+2) : dimanche 18 oct. 23 h 30 et lundi 19 oct. 0 h 30 à Paris.
const SUN_18_2330 = "2026-10-18T21:30:00Z";
const MON_19_0030 = "2026-10-18T22:30:00Z";
// Passage à l'heure d'hiver le dimanche 25 oct. (UTC+1 ensuite) :
// dimanche 25 oct. 23 h 30 et lundi 26 oct. 0 h 30 à Paris.
const SUN_25_2330 = "2026-10-25T22:30:00Z";
const MON_26_0030 = "2026-10-25T23:30:00Z";

function row(
  exercise_id: string,
  session_id: string,
  performed_at: string,
  weight_kg: number,
  reps: number,
): ProgressRow {
  return { exercise_id, session_id, weight_kg, reps, sessions: { performed_at } };
}

const ME: Member = { id: "me", name: "Théo", color: "#2FE6FF", isMe: true };
const PARTNER: Member = { id: "p", name: "Lina", color: "#FF4F7E", isMe: false };

test.describe("calendrier de Paris", () => {
  test("dimanche 23 h 30 et lundi 0 h 30 (heure d'été) : deux semaines différentes", () => {
    expect(mondayDayNumber(new Date(SUN_18_2330))).toBe(day("2026-10-12"));
    expect(mondayDayNumber(new Date(MON_19_0030))).toBe(day("2026-10-19"));
  });

  test("passage à l'heure d'hiver (25/10/2026) : semaine et jour exacts", () => {
    expect(localDayNumber(new Date(SUN_25_2330))).toBe(day("2026-10-25"));
    expect(mondayDayNumber(new Date(SUN_25_2330))).toBe(day("2026-10-19"));
    expect(mondayDayNumber(new Date(MON_26_0030))).toBe(day("2026-10-26"));
  });

  test("mois : le 1er à 0 h 30 à Paris est déjà le nouveau mois", () => {
    // 30 sept. 23 h 30 / 1er oct. 0 h 30 à Paris.
    expect(localMonthIndex(new Date("2026-09-30T21:30:00Z"))).toBe(2026 * 12 + 8);
    expect(localMonthIndex(new Date("2026-09-30T22:30:00Z"))).toBe(2026 * 12 + 9);
  });

  test("dates affichées en heure de Paris", () => {
    expect(formatDateShort("2026-09-30T22:30:00Z")).toBe("1 oct.");
    expect(formatDateShort("2026-09-30T21:30:00Z")).toBe("30 sept.");
    expect(formatDateLong(MON_26_0030)).toBe("lun. 26 oct. 2026");
  });

  test("séances de la semaine : à partir du lundi 0 h à Paris", () => {
    const now = new Date("2026-10-28T10:00:00Z"); // mercredi 28 oct.
    const sessions = [
      { id: "dim", performed_at: SUN_25_2330 },
      { id: "lun", performed_at: MON_26_0030 },
    ];
    expect(filterSinceMonday(sessions, now).map((s) => s.id)).toEqual(["lun"]);
  });
});

test.describe("profil affiché (?profile=)", () => {
  const duo = [ME, PARTNER];

  test("sans paramètre : moi", () => {
    expect(pickSelectedProfile(duo, null, "me")).toBe("me");
  });

  test("id du partenaire de duo actif : retenu", () => {
    expect(pickSelectedProfile(duo, "p", "me")).toBe("p");
  });

  test("id étranger : ignoré, moi", () => {
    expect(pickSelectedProfile(duo, "quelquun-d-autre", "me")).toBe("me");
    expect(pickSelectedProfile([ME], "p", "me")).toBe("me");
  });

  test("partenaire illisible (ligne neutre) : toujours sélectionnable", () => {
    const members = toMembers(
      [
        { id: "me", display_name: "Théo", accent_color: "#2FE6FF" },
        { id: "p", display_name: "", accent_color: "" },
      ],
      "me",
    );
    expect(members[1]!.name).toBe("Partenaire");
    expect(pickSelectedProfile(members, "p", "me")).toBe("p");
  });

  test("aucun membre connu : moi", () => {
    expect(pickSelectedProfile([], "p", "me")).toBe("me");
    expect(pickSelectedProfile([], null, "me")).toBe("me");
  });
});

test.describe("agrégats", () => {
  // Maintenant : lundi 26 oct. 2026, 0 h 30 à Paris (après le passage à l'heure d'hiver).
  const NOW = new Date(MON_26_0030);
  const SETS: ProgressRow[] = [
    row("bench", "s1", "2026-09-30T21:30:00Z", 60, 8), // 30 sept. : mois dernier
    row("bench", "s2", SUN_25_2330, 62.5, 8), // dimanche : semaine du 19/10
    row("bench", "s3", MON_26_0030, 70, 3), // lundi : semaine du 26/10
    row("squat", "s3", MON_26_0030, 100, 5),
  ];

  test("courbes : une valeur par séance, triées par date, exercice le plus suivi d'abord", () => {
    const series = buildSeries(SETS, { bench: "Développé couché", squat: "Squat" });
    expect(series.map((s) => s.name)).toEqual(["Développé couché", "Squat"]);
    expect(series[0]!.points.map((p) => p.topWeight)).toEqual([60, 62.5, 70]);
    expect(series[0]!.points.map((p) => p.label)).toEqual(["30 sept.", "25 oct.", "26 oct."]);
  });

  test("stats solo : mois, semaines et objectif à l'heure de Paris, aucune comparaison", () => {
    const stats = buildStats({
      allSets: SETS,
      names: { bench: "Développé couché", squat: "Squat" },
      muscleByEx: { bench: "chest", squat: "quads" },
      weekGoal: 3,
      selectedProfileId: "me",
      members: [ME],
      weekSessions: [{ id: "s3", profile_id: "me", performed_at: MON_26_0030 }],
      weekSetSessionIds: [],
      now: NOW,
    });
    expect(stats.sessionsThisMonth).toBe(2);
    expect(stats.sessionsDelta).toBe(1);
    expect(stats.totalSets).toBe(4);
    expect(stats.totalVolumeKg).toBe(60 * 8 + 62.5 * 8 + 70 * 3 + 100 * 5);
    expect(stats.recordExercise).toBe("Squat");
    expect(stats.weekGoal).toBe(3);
    expect(stats.weekSessions).toBe(1);
    expect(stats.weeks.map((w) => w.label)).toEqual([
      "21/9",
      "28/9",
      "5/10",
      "12/10",
      "19/10",
      "26/10",
    ]);
    expect(stats.weeks[1]!.volume).toBe(60 * 8);
    expect(stats.weeks[4]!.volume).toBe(62.5 * 8);
    expect(stats.weeks[5]!.volume).toBe(70 * 3 + 100 * 5);
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
        { id: "s3", profile_id: "me", performed_at: MON_26_0030 },
        { id: "s4", profile_id: "p", performed_at: MON_26_0030 },
      ],
      weekSetSessionIds: ["s3", "s3", "s4"],
      now: NOW,
    });
    expect(stats.weekSessions).toBe(1);
    expect(stats.couple).toEqual([
      { name: "Théo", color: "#2FE6FF", sets: 2 },
      { name: "Lina", color: "#FF4F7E", sets: 1 },
    ]);
  });
});
