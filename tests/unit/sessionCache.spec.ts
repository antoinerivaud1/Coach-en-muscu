import { test, expect } from "@playwright/test";
import type { LoggerData } from "@/lib/data/sessionDetail";
import { LAST_PROFILE_KEY, OFFLINE_SESSION_PREFIX, isOfflineCacheKey, isQueueKey } from "@/lib/offline/keys";
import { memoryStore } from "@/lib/offline/queueStore";
import {
  MAX_ACTIVE_SNAPSHOTS,
  activeSessionKey,
  applyJournal,
  dropActiveSession,
  isLoggerData,
  lastKnownProfileId,
  latestLocalSession,
  offlineSessionFromPack,
  packKey,
  packSavedAt,
  prunePacks,
  readActiveSession,
  readPack,
  recordConfirmed,
  rememberProfileId,
  saveActiveSession,
  savePack,
} from "@/lib/offline/sessionCache";
import { queueStorageKey, serializeQueue, type PendingSet } from "@/lib/utils/setQueue";

// CM-90 (PR 2) : cache local des séances (packs, séance en cours).
// Lancer : npm run test:unit

const P = "11111111-1111-1111-1111-111111111111";

function logger(sessionId = "s1"): LoggerData {
  return {
    kind: "logger",
    ownerId: P,
    ownerAccent: null,
    sessionId,
    dayName: "Pec",
    startedAt: "2026-10-13T18:00:00.000Z",
    finishedDurationSeconds: null,
    initialFeedback: null,
    exercises: [
      {
        exerciseId: "bench",
        name: "Développé couché",
        muscleGroup: "chest",
        targetSets: 3,
        targetRepsMin: 8,
        targetRepsMax: 10,
        restSeconds: 120,
        source: "program",
        last: null,
      },
    ],
    initialSets: {
      bench: [
        { id: null, setIndex: null, weight: "60", reps: "8", isWarmup: false },
        { id: null, setIndex: null, weight: "", reps: "", isWarmup: false },
        { id: null, setIndex: null, weight: "", reps: "", isWarmup: false },
      ],
    },
    catalog: [
      {
        id: "curl",
        name: "Curl",
        muscle_group: "biceps",
        is_compound: false,
        duo_id: null,
        owner_profile_id: null,
      },
    ],
    canCreateExercise: true,
  } as LoggerData;
}

function aSet(id: string, over: Partial<PendingSet> = {}): PendingSet {
  return {
    id,
    sessionId: "s1",
    exerciseId: "bench",
    setIndex: 1,
    weightKg: 62.5,
    reps: 8,
    isWarmup: false,
    rpe: null,
    ...over,
  };
}

test.describe("packs séance", () => {
  test("aller-retour, compte vérifié, âge connu", () => {
    const store = memoryStore();
    savePack(store, P, "d1", logger("00000000-0000-0000-0000-000000000000"), 1234);
    expect(readPack(store, P, "d1")?.dayName).toBe("Pec");
    expect(readPack(store, "autre", "d1")).toBeNull();
    expect(packSavedAt(store, P, "d1")).toBe(1234);
    expect(packSavedAt(store, P, "d2")).toBe(0);
  });

  test("pack illisible : ignoré", () => {
    const store = memoryStore({ [packKey(P, "d1")]: '{"profileId":"x","data":{}}' });
    expect(readPack(store, P, "d1")).toBeNull();
    expect(isLoggerData({ kind: "logger" })).toBe(false);
  });

  test("les packs des séances types disparues sont retirés", () => {
    const store = memoryStore();
    savePack(store, P, "d1", logger(), 1);
    savePack(store, P, "d2", logger(), 1);
    savePack(store, "autre", "d9", logger(), 1);
    prunePacks(store, P, ["d1"]);
    expect(readPack(store, P, "d1")).not.toBeNull();
    expect(readPack(store, P, "d2")).toBeNull();
    // Le pack d'un autre compte n'est pas touché ici (purgé à la déconnexion).
    expect(store.getItem(packKey("autre", "d9"))).not.toBeNull();
  });

  test("séance hors ligne : id et heure du téléphone, rien de terminé", () => {
    const pack = { ...logger(), finishedDurationSeconds: 600, initialFeedback: "easy" as const };
    const data = offlineSessionFromPack(pack, "new-id", "2026-10-13T19:00:00.000Z");
    expect(data.sessionId).toBe("new-id");
    expect(data.startedAt).toBe("2026-10-13T19:00:00.000Z");
    expect(data.finishedDurationSeconds).toBeNull();
    expect(data.initialFeedback).toBeNull();
    expect(data.initialSets).toEqual(pack.initialSets);
  });
});

test.describe("séance en cours", () => {
  test("rouverte hors ligne avec les séries confirmées depuis la lecture", () => {
    const store = memoryStore();
    saveActiveSession(store, P, logger(), 1);
    recordConfirmed(store, "s1", { kind: "upsert", set: aSet("a", { setIndex: 1 }) });
    recordConfirmed(store, "s1", { kind: "upsert", set: aSet("b", { setIndex: 2, weightKg: 65 }) });
    const rows = readActiveSession(store, "s1", P)!.data.initialSets.bench!;
    expect(rows.map((r) => r.id)).toEqual(["a", "b", null]);
    expect(rows[1]).toMatchObject({ weight: "65", reps: "8", setIndex: 2 });
    // La ligne suivante hérite de la dernière série, comme pendant la saisie.
    expect(rows[2]).toMatchObject({ weight: "65", reps: "8" });
  });

  test("correction et suppression confirmées", () => {
    const store = memoryStore();
    saveActiveSession(store, P, logger(), 1);
    recordConfirmed(store, "s1", { kind: "upsert", set: aSet("a") });
    recordConfirmed(store, "s1", { kind: "upsert", set: aSet("a", { reps: 10 }) });
    recordConfirmed(store, "s1", { kind: "upsert", set: aSet("b", { setIndex: 2 }) });
    recordConfirmed(store, "s1", { kind: "delete", id: "b" });
    const rows = readActiveSession(store, "s1", P)!.data.initialSets.bench!;
    expect(rows.filter((r) => r.id !== null)).toEqual([
      { id: "a", setIndex: 1, weight: "62.5", reps: "10", isWarmup: false },
    ]);
  });

  test("exercice ajouté en séance : recréé depuis le catalogue", () => {
    const data = applyJournal(logger(), [
      { kind: "upsert", set: aSet("c", { exerciseId: "curl", weightKg: 12 }) },
    ]);
    expect(data.exercises.map((e) => e.exerciseId)).toEqual(["bench", "curl"]);
    expect(data.exercises[1]).toMatchObject({ source: "extra", name: "Curl" });
    expect(data.initialSets.curl![0]).toMatchObject({ id: "c", weight: "12" });
  });

  test("exercice inconnu du catalogue : ignoré sans planter", () => {
    const data = applyJournal(logger(), [{ kind: "upsert", set: aSet("x", { exerciseId: "zzz" }) }]);
    expect(data.exercises).toHaveLength(1);
  });

  test("une nouvelle lecture repart d'un journal vide", () => {
    const store = memoryStore();
    saveActiveSession(store, P, logger(), 1);
    recordConfirmed(store, "s1", { kind: "upsert", set: aSet("a") });
    saveActiveSession(store, P, logger(), 2);
    expect(readActiveSession(store, "s1", P)!.data.initialSets.bench![0]!.id).toBeNull();
  });

  test("autre compte ou séance absente : rien", () => {
    const store = memoryStore();
    saveActiveSession(store, P, logger(), 1);
    expect(readActiveSession(store, "s1", "autre")).toBeNull();
    expect(readActiveSession(store, "s2", P)).toBeNull();
    dropActiveSession(store, "s1");
    expect(readActiveSession(store, "s1", P)).toBeNull();
  });

  test(`au plus ${MAX_ACTIVE_SNAPSHOTS} séances gardées, les plus récentes`, () => {
    const store = memoryStore();
    for (let i = 1; i <= MAX_ACTIVE_SNAPSHOTS + 2; i += 1) {
      saveActiveSession(store, P, logger(`s${i}`), i);
    }
    const kept = store.keys().filter((k) => k.startsWith(OFFLINE_SESSION_PREFIX)).sort();
    expect(kept).toEqual(
      Array.from({ length: MAX_ACTIVE_SNAPSHOTS }, (_, i) => activeSessionKey(`s${i + 3}`)).sort(),
    );
  });
});

test.describe("dernier compte connu", () => {
  test("mémorisé, relu, et classé comme cache (purgé, jamais compté)", () => {
    const store = memoryStore();
    expect(lastKnownProfileId(store)).toBeNull();
    rememberProfileId(store, P);
    expect(lastKnownProfileId(store)).toBe(P);
    expect(isOfflineCacheKey(LAST_PROFILE_KEY)).toBe(true);
    expect(isQueueKey(LAST_PROFILE_KEY)).toBe(false);
    expect(isOfflineCacheKey(packKey(P, "d1"))).toBe(true);
  });
});

test.describe("séance en cours pour « Reprendre » (CM-90 PR 4)", () => {
  test("la plus récente du compte, avec séries confirmées et en file", () => {
    const store = memoryStore();
    saveActiveSession(store, P, logger("s1"), 1);
    saveActiveSession(store, P, logger("s2"), 2);
    saveActiveSession(store, "autre", logger("s3"), 3);
    recordConfirmed(store, "s2", { kind: "upsert", set: aSet("a", { sessionId: "s2" }) });
    store.setItem(
      queueStorageKey("s2"),
      serializeQueue([
        { kind: "upsert", set: aSet("b", { sessionId: "s2", setIndex: 2 }), attempts: 0 },
        // Re-écriture d'une série confirmée : comptée une fois.
        { kind: "upsert", set: aSet("a", { sessionId: "s2", weightKg: 65 }), attempts: 0 },
      ]),
    );
    expect(latestLocalSession(store, P)).toEqual({
      sessionId: "s2",
      dayName: "Pec",
      startedAt: "2026-10-13T18:00:00.000Z",
      setCount: 2,
    });
  });

  test("une série supprimée en file n'est plus comptée", () => {
    const store = memoryStore();
    saveActiveSession(store, P, logger("s1"), 1);
    recordConfirmed(store, "s1", { kind: "upsert", set: aSet("a") });
    store.setItem(queueStorageKey("s1"), serializeQueue([{ kind: "delete", id: "a", sessionId: "s1", attempts: 0 }]));
    expect(latestLocalSession(store, P)?.setCount).toBe(0);
  });

  test("séance close (clôture en file) ou terminée : ignorée", () => {
    const store = memoryStore();
    saveActiveSession(store, P, logger("s1"), 1);
    saveActiveSession(store, P, { ...logger("s2"), finishedDurationSeconds: 600 }, 2);
    expect(latestLocalSession(store, P)?.sessionId).toBe("s1");
    expect(latestLocalSession(store, P, (id) => id === "s1")).toBeNull();
    expect(latestLocalSession(store, "autre")).toBeNull();
  });
});
