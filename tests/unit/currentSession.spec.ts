import { test, expect } from "@playwright/test";
import {
  ABANDONED_EMPTY_SESSION_MS,
  STALE_SESSION_MS,
  closingDurationSeconds,
  resumeBannerState,
  type CurrentSessionInput,
} from "@/lib/utils/currentSession";

// Tests unitaires purs (CM-67) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

const NOW = new Date("2026-09-12T18:00:00.000Z");

/** Une séance en cours démarrée il y a `agoMs`, avec `setCount` séries écrites. */
function session(agoMs: number, setCount: number): CurrentSessionInput {
  const startedAt = NOW.getTime() - agoMs;
  return {
    id: "sess-1",
    performedAt: new Date(startedAt).toISOString(),
    // Une série toutes les 5 min à partir du début, comme une vraie séance.
    setCreatedAt: Array.from({ length: setCount }, (_, i) =>
      new Date(startedAt + (i + 1) * 5 * 60 * 1000).toISOString(),
    ),
  };
}

test.describe("resumeBannerState (CM-83)", () => {
  test("aucune séance en cours : aucun bandeau", () => {
    expect(resumeBannerState(null, NOW)).toEqual({ kind: "none" });
  });

  test("séance récente avec des séries : bandeau « Reprendre » simple", () => {
    const state = resumeBannerState(session(30 * 60 * 1000, 2), NOW);
    expect(state).toEqual({
      kind: "banner",
      sessionId: "sess-1",
      setCount: 2,
      stale: false,
    });
  });

  test("séance vide et récente : bandeau quand même, la règle des 2 h ne concerne que la suppression", () => {
    const state = resumeBannerState(session(10 * 60 * 1000, 0), NOW);
    expect(state).toEqual({
      kind: "banner",
      sessionId: "sess-1",
      setCount: 0,
      stale: false,
    });
  });

  test("séance vide de plus de 2 h : abandonnée, donc aucun bandeau", () => {
    const state = resumeBannerState(
      session(ABANDONED_EMPTY_SESSION_MS + 60 * 1000, 0),
      NOW,
    );
    expect(state).toEqual({ kind: "abandoned", sessionId: "sess-1" });
  });

  test("séance vide pile à 2 h : encore reprenable, le seuil est strict", () => {
    const state = resumeBannerState(session(ABANDONED_EMPTY_SESSION_MS, 0), NOW);
    expect(state.kind).toBe("banner");
  });

  test("séance avec séries de plus de 12 h : les trois actions", () => {
    const state = resumeBannerState(
      session(STALE_SESSION_MS + 60 * 1000, 6),
      NOW,
    );
    expect(state).toEqual({
      kind: "banner",
      sessionId: "sess-1",
      setCount: 6,
      stale: true,
    });
  });

  test("une séance avec des séries n'est JAMAIS abandonnée, même très ancienne", () => {
    const state = resumeBannerState(session(30 * 24 * 3600 * 1000, 4), NOW);
    expect(state.kind).toBe("banner");
    expect(state.kind === "banner" && state.stale).toBe(true);
  });

  test("date de début invalide : traitée comme « à l'instant », jamais supprimable", () => {
    const state = resumeBannerState(
      { id: "sess-1", performedAt: "pas une date", setCreatedAt: [] },
      NOW,
    );
    expect(state).toEqual({
      kind: "banner",
      sessionId: "sess-1",
      setCount: 0,
      stale: false,
    });
  });

  test("date de début dans le futur : âge ramené à zéro", () => {
    const state = resumeBannerState(session(-3600 * 1000, 0), NOW);
    expect(state.kind).toBe("banner");
  });
});

test.describe("closingDurationSeconds (CM-83)", () => {
  test("compte jusqu'à la dernière série écrite, pas jusqu'à maintenant", () => {
    // Séance démarrée il y a 15 h, dernière série 40 min après le début.
    const s = session(15 * 3600 * 1000, 8);
    expect(closingDurationSeconds(s.performedAt, s.setCreatedAt)).toBe(40 * 60);
  });

  test("l'ordre des séries n'a pas d'importance, c'est le max qui compte", () => {
    const start = "2026-09-12T08:00:00.000Z";
    const sets = [
      "2026-09-12T08:30:00.000Z",
      "2026-09-12T08:10:00.000Z",
      "2026-09-12T08:20:00.000Z",
    ];
    expect(closingDurationSeconds(start, sets)).toBe(30 * 60);
  });

  test("aucune série : null, à l'appelant de décider (jamais null en base)", () => {
    expect(closingDurationSeconds("2026-09-12T08:00:00.000Z", [])).toBeNull();
  });

  test("dates de séries toutes invalides : null", () => {
    expect(
      closingDurationSeconds("2026-09-12T08:00:00.000Z", ["x", "y"]),
    ).toBeNull();
  });

  test("date de début invalide : null", () => {
    expect(
      closingDurationSeconds("pas une date", ["2026-09-12T08:10:00.000Z"]),
    ).toBeNull();
  });

  test("série validée dans la seconde : au moins 1, jamais 0", () => {
    expect(
      closingDurationSeconds("2026-09-12T08:00:00.000Z", [
        "2026-09-12T08:00:00.200Z",
      ]),
    ).toBe(1);
  });

  test("série antérieure au début (horloges décalées) : ramenée à 1 seconde", () => {
    expect(
      closingDurationSeconds("2026-09-12T08:00:00.000Z", [
        "2026-09-12T07:50:00.000Z",
      ]),
    ).toBe(1);
  });
});
