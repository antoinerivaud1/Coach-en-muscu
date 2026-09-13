import { test, expect } from "@playwright/test";
import {
  NEVER_DONE_DAYS,
  effectiveStalenessDays,
  muscleRecency,
  pickRecommendedSeance,
  recommendationScore,
} from "@/lib/utils/recommendation";
import type { SeanceCard, SessionHistoryEntry } from "@/lib/utils/recommendation";

// Tests unitaires purs (CM-77) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

// Un mercredi à 18 h, heure de Paris.
const NOW = new Date("2026-09-16T16:00:00Z");
const daysAgo = (n: number): string =>
  new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

function seance(
  id: string,
  groups: SeanceCard["groups"],
  lastDoneAt: string | null,
): SeanceCard {
  return {
    id,
    name: id,
    programName: "Nos séances",
    exerciseCount: groups.length,
    setCount: groups.length * 3,
    groups,
    lastDoneAt,
  };
}

const PEC_GROUPS: SeanceCard["groups"] = ["chest", "chest", "triceps", "shoulders"];
const DOS_GROUPS: SeanceCard["groups"] = ["back", "back", "biceps"];
const JAMBES_GROUPS: SeanceCard["groups"] = ["quads", "hamstrings", "glutes"];

test.describe("muscleRecency (CM-77)", () => {
  test("retient, par groupe, le plus petit nombre de jours depuis la dernière sollicitation", () => {
    const history: SessionHistoryEntry[] = [
      { performedAt: daysAgo(5), groups: ["chest", "triceps"] },
      { performedAt: daysAgo(1), groups: ["chest"] },
    ];
    const recency = muscleRecency(history, NOW);
    expect(recency.get("chest")).toBe(1);
    expect(recency.get("triceps")).toBe(5);
    expect(recency.has("back")).toBe(false);
  });

  test("ignore les séances hors de la fenêtre d'équilibre", () => {
    const recency = muscleRecency([{ performedAt: daysAgo(9), groups: ["quads"] }], NOW);
    expect(recency.size).toBe(0);
  });
});

test.describe("effectiveStalenessDays (CM-77)", () => {
  test("jamais faite + muscles frais : ancienneté maximale conservée", () => {
    const recency = muscleRecency([{ performedAt: daysAgo(1), groups: DOS_GROUPS }], NOW);
    expect(effectiveStalenessDays(seance("Pec", PEC_GROUPS, null), recency, NOW)).toBe(
      NEVER_DONE_DAYS,
    );
  });

  test("jamais faite + muscles principaux travaillés hier : traitée comme faite hier", () => {
    const recency = muscleRecency([{ performedAt: daysAgo(1), groups: PEC_GROUPS }], NOW);
    expect(effectiveStalenessDays(seance("Pec", PEC_GROUPS, null), recency, NOW)).toBe(1);
  });

  test("jamais faite + muscles travaillés il y a 3 jours : plus considérés comme chauds", () => {
    const recency = muscleRecency([{ performedAt: daysAgo(3), groups: PEC_GROUPS }], NOW);
    expect(effectiveStalenessDays(seance("Pec", PEC_GROUPS, null), recency, NOW)).toBe(
      NEVER_DONE_DAYS,
    );
  });

  test("jamais faite + seulement un exercice sur quatre sur un muscle chaud : pas de rétrogradation", () => {
    const recency = muscleRecency([{ performedAt: daysAgo(0), groups: ["shoulders"] }], NOW);
    expect(effectiveStalenessDays(seance("Pec", PEC_GROUPS, null), recency, NOW)).toBe(
      NEVER_DONE_DAYS,
    );
  });

  test("séance déjà faite : ancienneté réelle, quel que soit l'état des muscles", () => {
    const recency = muscleRecency([{ performedAt: daysAgo(1), groups: PEC_GROUPS }], NOW);
    expect(
      effectiveStalenessDays(seance("Pec", PEC_GROUPS, daysAgo(10)), recency, NOW),
    ).toBe(10);
  });
});

test.describe("pickRecommendedSeance (CM-77) : les trois cas du ticket", () => {
  test("jamais faite + muscles frais : elle reste favorisée", () => {
    const history: SessionHistoryEntry[] = [
      { performedAt: daysAgo(1), groups: DOS_GROUPS },
      { performedAt: daysAgo(3), groups: JAMBES_GROUPS },
    ];
    const recency = muscleRecency(history, NOW);
    const seances = [
      seance("Pec", PEC_GROUPS, null),
      seance("Dos", DOS_GROUPS, daysAgo(1)),
      seance("Jambes", JAMBES_GROUPS, daysAgo(3)),
    ];
    expect(pickRecommendedSeance(seances, recency, history.length, NOW)?.id).toBe("Pec");
  });

  test("jamais faite + muscles travaillés hier : une autre séance passe devant (cas du doublon Pec)", () => {
    // « Pec (copie) » faite ce matin, « Pec » jamais faite : l'accueil ne doit
    // plus proposer « Pec » alors que les pectoraux viennent d'être travaillés.
    const history: SessionHistoryEntry[] = [
      { performedAt: daysAgo(0), groups: PEC_GROUPS },
      { performedAt: daysAgo(4), groups: DOS_GROUPS },
    ];
    const recency = muscleRecency(history, NOW);
    const seances = [
      seance("Pec", PEC_GROUPS, null),
      seance("Pec (copie)", PEC_GROUPS, daysAgo(0)),
      seance("Dos", DOS_GROUPS, daysAgo(4)),
    ];
    const picked = pickRecommendedSeance(seances, recency, history.length, NOW);
    expect(picked?.id).toBe("Dos");
  });

  test("ancienne + muscles travaillés hier : la pénalité joue, une séance aux muscles reposés gagne", () => {
    const history: SessionHistoryEntry[] = [
      { performedAt: daysAgo(1), groups: PEC_GROUPS },
      { performedAt: daysAgo(6), groups: DOS_GROUPS },
      { performedAt: daysAgo(12), groups: JAMBES_GROUPS },
    ];
    const recency = muscleRecency(history, NOW);
    const pec = seance("Pec", PEC_GROUPS, daysAgo(1));
    const dos = seance("Dos", DOS_GROUPS, daysAgo(6));
    const jambes = seance("Jambes", JAMBES_GROUPS, daysAgo(12));
    // Pec : 1 - 7 = -6 ; Dos : 6 - 7 = -1 ; Jambes : 12 - 0 = 12.
    expect(recommendationScore(pec, recency, NOW)).toBeCloseTo(-6);
    expect(recommendationScore(dos, recency, NOW)).toBeCloseTo(-1);
    expect(recommendationScore(jambes, recency, NOW)).toBe(12);
    expect(pickRecommendedSeance([pec, dos, jambes], recency, history.length, NOW)?.id).toBe(
      "Jambes",
    );
  });

  test("à muscles égaux, la jamais faite garde l'avantage sur une ancienne", () => {
    const history: SessionHistoryEntry[] = [
      { performedAt: daysAgo(3), groups: DOS_GROUPS },
      { performedAt: daysAgo(5), groups: DOS_GROUPS },
    ];
    const recency = muscleRecency(history, NOW);
    const seances = [
      seance("Pec ancienne", PEC_GROUPS, daysAgo(20)),
      seance("Pec nouvelle", PEC_GROUPS, null),
    ];
    expect(pickRecommendedSeance(seances, recency, history.length, NOW)?.id).toBe(
      "Pec nouvelle",
    );
  });
});
