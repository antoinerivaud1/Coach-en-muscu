import { test, expect } from "@playwright/test";
import type { ActionResult } from "@/lib/data/sessionWrites";
import type { DurableStore } from "@/lib/offline/durableQueues";
import { decodeDurable, encodeDurable, reconcileQueues } from "@/lib/offline/durableQueues";
import {
  PENDING_SESSIONS_KEY,
  PENDING_STARTS_KEY,
  PURGE_MARKER_KEY,
  isPendingQueueKey,
  isQueueKey,
} from "@/lib/offline/keys";
import { outboxCounts, replayOutbox, type OutboxDeps } from "@/lib/offline/outbox";
import {
  addPendingStart,
  getPendingStarts,
  getRefusedStarts,
  hasPendingStart,
  parseStarts,
  type PendingStart,
} from "@/lib/offline/pendingStarts";
import { claimSessionQueue, isSessionQueueOwned } from "@/lib/offline/queueOwners";
import { memoryStore } from "@/lib/offline/queueStore";
import { getPending, getRefusedSessions } from "@/lib/pendingSessions";
import {
  queueStorageKey,
  refusedStorageKey,
  serializeQueue,
  type PendingSet,
  type QueuedOp,
} from "@/lib/utils/setQueue";

// CM-90 (PR 1) : tests purs de la file unifiée et de la copie durable.
// Lancer : npm run test:unit

const OK: ActionResult = { ok: true };
const RETRY: ActionResult = { ok: false, error: "réseau" };
const REFUSED: ActionResult = { ok: false, error: "refusé", refused: true };

function aSet(id: string, sessionId: string): PendingSet {
  return { id, sessionId, exerciseId: "ex", setIndex: 1, weightKg: 50, reps: 8, isWarmup: false, rpe: null };
}

function upsert(id: string, sessionId: string): QueuedOp {
  return { kind: "upsert", set: aSet(id, sessionId), attempts: 0 };
}

function aStart(sessionId: string): PendingStart {
  return { sessionId, profileId: "p1", programDayId: "d1", performedAt: "2026-10-13T18:00:00.000Z" };
}

/** Dépendances qui journalisent chaque appel ; résultats programmables. */
function fakeDeps(
  store = memoryStore(),
  results: Partial<Record<"start" | "set" | "del" | "finish", (key: string) => ActionResult | Error>> = {},
) {
  const calls: string[] = [];
  const run = (kind: "start" | "set" | "del" | "finish", key: string): Promise<ActionResult> => {
    calls.push(`${kind}:${key}`);
    const r = results[kind]?.(key) ?? OK;
    return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
  };
  const deps: OutboxDeps = {
    store,
    isOwned: () => false,
    startSession: (s) => run("start", s.sessionId),
    upsertSet: (s) => run("set", s.id),
    deleteSet: (d) => run("del", d.id),
    finishSession: (f) => run("finish", f.sessionId),
  };
  return { deps, calls, store };
}

test.describe("clés des files", () => {
  test("les files sont reconnues, pas le marqueur de purge", () => {
    expect(isQueueKey(PENDING_STARTS_KEY)).toBe(true);
    expect(isQueueKey(queueStorageKey("s1"))).toBe(true);
    expect(isQueueKey(refusedStorageKey("s1"))).toBe(true);
    expect(isQueueKey(PURGE_MARKER_KEY)).toBe(false);
    expect(isQueueKey("sb-xyz-auth-token")).toBe(false);
    expect(isPendingQueueKey(refusedStorageKey("s1"))).toBe(false);
  });
});

test.describe("démarrages hors ligne", () => {
  test("un même démarrage n'est jamais mis deux fois", () => {
    const store = memoryStore();
    addPendingStart(store, aStart("s1"));
    addPendingStart(store, aStart("s1"));
    expect(getPendingStarts(store)).toHaveLength(1);
    expect(hasPendingStart(store, "s1")).toBe(true);
    expect(hasPendingStart(store, "s2")).toBe(false);
  });

  test("relecture défensive", () => {
    expect(parseStarts("pas du json")).toEqual([]);
    expect(parseStarts('[{"sessionId":"s1"}, 3]')).toEqual([]);
    expect(parseStarts(JSON.stringify([aStart("s1")]))).toEqual([aStart("s1")]);
  });
});

test.describe("rejeu ordonné", () => {
  test("démarrage, puis séries dans l'ordre, puis clôture", async () => {
    const store = memoryStore({
      [PENDING_STARTS_KEY]: JSON.stringify([aStart("s1")]),
      [queueStorageKey("s1")]: serializeQueue([upsert("a", "s1"), upsert("b", "s1")]),
      [PENDING_SESSIONS_KEY]: JSON.stringify([{ sessionId: "s1", feedback: null, durationSeconds: 60 }]),
    });
    const { deps, calls } = fakeDeps(store);
    const report = await replayOutbox(deps);
    expect(calls).toEqual(["start:s1", "set:a", "set:b", "finish:s1"]);
    expect(report.written).toBe(4);
    expect(store.keys().filter(isQueueKey)).toEqual([]);
  });

  test("démarrage en échec : ni séries ni clôture de CETTE séance, les autres passent", async () => {
    const store = memoryStore({
      [PENDING_STARTS_KEY]: JSON.stringify([aStart("s1")]),
      [queueStorageKey("s1")]: serializeQueue([upsert("a", "s1")]),
      [queueStorageKey("s2")]: serializeQueue([upsert("x", "s2")]),
      [PENDING_SESSIONS_KEY]: JSON.stringify([
        { sessionId: "s1", feedback: null, durationSeconds: 60 },
        { sessionId: "s2", feedback: null, durationSeconds: 60 },
      ]),
    });
    const { deps, calls } = fakeDeps(store, { start: () => RETRY });
    await replayOutbox(deps);
    expect(calls).toEqual(["start:s1", "set:x", "finish:s2"]);
    expect(getPendingStarts(store)).toHaveLength(1);
    expect(getPending(store).map((p) => p.sessionId)).toEqual(["s1"]);
  });

  test("hors ligne (exception) : rien n'est perdu", async () => {
    const store = memoryStore({
      [queueStorageKey("s1")]: serializeQueue([upsert("a", "s1"), upsert("b", "s1")]),
      [PENDING_SESSIONS_KEY]: JSON.stringify([{ sessionId: "s1", feedback: null, durationSeconds: 60 }]),
    });
    const { deps, calls } = fakeDeps(store, { set: () => new Error("offline") });
    await replayOutbox(deps);
    // Première série en échec : la suivante et la clôture attendent.
    expect(calls).toEqual(["set:a"]);
    expect(store.getItem(queueStorageKey("s1"))).toBe(
      serializeQueue([upsert("a", "s1"), upsert("b", "s1")]),
    );
    expect(getPending(store)).toHaveLength(1);
  });

  test("série refusée : mise de côté, la file continue", async () => {
    const store = memoryStore({
      [queueStorageKey("s1")]: serializeQueue([upsert("a", "s1"), upsert("b", "s1")]),
    });
    const { deps, calls } = fakeDeps(store, { set: (id) => (id === "a" ? REFUSED : OK) });
    await replayOutbox(deps);
    expect(calls).toEqual(["set:a", "set:b"]);
    expect(store.getItem(queueStorageKey("s1"))).toBeNull();
    expect(store.getItem(refusedStorageKey("s1"))).toBe(serializeQueue([upsert("a", "s1")]));
  });

  test("démarrage et clôture refusés : mis de côté, jamais jetés", async () => {
    const store = memoryStore({
      [PENDING_STARTS_KEY]: JSON.stringify([aStart("s1")]),
      [PENDING_SESSIONS_KEY]: JSON.stringify([{ sessionId: "s9", feedback: null, durationSeconds: 60 }]),
    });
    const { deps } = fakeDeps(store, { start: () => REFUSED, finish: () => REFUSED });
    await replayOutbox(deps);
    expect(getRefusedStarts(store)).toEqual([aStart("s1")]);
    expect(getRefusedSessions(store).map((p) => p.sessionId)).toEqual(["s9"]);
    expect(getPending(store)).toEqual([]);
  });

  test("file possédée par l'écran de saisie : jamais envoyée ici, clôture en attente", async () => {
    const store = memoryStore({
      [queueStorageKey("s1")]: serializeQueue([upsert("a", "s1")]),
      [PENDING_SESSIONS_KEY]: JSON.stringify([{ sessionId: "s1", feedback: null, durationSeconds: 60 }]),
    });
    const { deps, calls } = fakeDeps(store);
    deps.isOwned = (id) => id === "s1";
    await replayOutbox(deps);
    expect(calls).toEqual([]);
    expect(getPending(store)).toHaveLength(1);
  });

  test("une clôture ajoutée pendant le passage n'est pas écrasée", async () => {
    const store = memoryStore({
      [PENDING_SESSIONS_KEY]: JSON.stringify([{ sessionId: "s1", feedback: null, durationSeconds: 60 }]),
    });
    const { deps } = fakeDeps(store, {
      finish: () => {
        store.setItem(
          PENDING_SESSIONS_KEY,
          JSON.stringify([
            { sessionId: "s1", feedback: null, durationSeconds: 60 },
            { sessionId: "s2", feedback: null, durationSeconds: 30 },
          ]),
        );
        return OK;
      },
    });
    await replayOutbox(deps);
    expect(getPending(store).map((p) => p.sessionId)).toEqual(["s2"]);
  });

  test("compteurs : séances possédées exclues, refus comptés", () => {
    const store = memoryStore({
      [PENDING_STARTS_KEY]: JSON.stringify([aStart("s3")]),
      [queueStorageKey("s1")]: serializeQueue([upsert("a", "s1"), upsert("b", "s1")]),
      [queueStorageKey("s2")]: serializeQueue([upsert("c", "s2")]),
      [refusedStorageKey("s1")]: serializeQueue([upsert("z", "s1")]),
    });
    expect(outboxCounts(store, (id) => id === "s2")).toEqual({ pending: 3, refused: 1 });
  });
});

test.describe("propriété des files", () => {
  test("libérée au démontage, compteur de montages", () => {
    const r1 = claimSessionQueue("s1");
    const r2 = claimSessionQueue("s1");
    expect(isSessionQueueOwned("s1")).toBe(true);
    r1();
    r1();
    expect(isSessionQueueOwned("s1")).toBe(true);
    r2();
    expect(isSessionQueueOwned("s1")).toBe(false);
  });
});

test.describe("copie durable (iPhone)", () => {
  function fakeDurable(initial: Record<string, string> = {}): DurableStore & { data: Map<string, string> } {
    const data = new Map(Object.entries(initial));
    return {
      data,
      get: async (k) => data.get(k) ?? null,
      set: async (k, v) => void data.set(k, v),
      remove: async (k) => void data.delete(k),
      keys: async () => Array.from(data.keys()),
    };
  }

  test("aller-retour d'encodage, entrée illisible ignorée", () => {
    expect(decodeDurable(encodeDurable("[1]", 5))).toEqual({ v: "[1]", at: 5 });
    expect(decodeDurable("{")).toBeNull();
    expect(decodeDurable(JSON.stringify({ v: 1, at: 2 }))).toBeNull();
  });

  test("localStorage purgé par iOS : la file est restaurée", async () => {
    const key = queueStorageKey("s1");
    const local = memoryStore();
    const durable = fakeDurable({ [key]: encodeDurable("[q]", 100) });
    await reconcileQueues(local, durable, 200);
    expect(local.getItem(key)).toBe("[q]");
  });

  test("copie antérieure à la déconnexion : jamais restaurée, effacée", async () => {
    const key = queueStorageKey("s1");
    const local = memoryStore({ [PURGE_MARKER_KEY]: "150" });
    const durable = fakeDurable({ [key]: encodeDurable("[old]", 100) });
    await reconcileQueues(local, durable, 200);
    expect(local.getItem(key)).toBeNull();
    expect(durable.data.has(key)).toBe(false);
  });

  test("première ouverture de cette version : files existantes recopiées", async () => {
    const key = queueStorageKey("s1");
    const local = memoryStore({ [key]: "[q]", "autre-cle": "x" });
    const durable = fakeDurable();
    await reconcileQueues(local, durable, 300);
    expect(decodeDurable(durable.data.get(key) ?? null)).toEqual({ v: "[q]", at: 300 });
    expect(durable.data.has("autre-cle")).toBe(false);
  });

  test("stockage durable en panne : ne lève pas, rien ne bouge", async () => {
    const local = memoryStore({ [queueStorageKey("s1")]: "[q]" });
    const broken: DurableStore = {
      get: () => Promise.reject(new Error("x")),
      set: () => Promise.reject(new Error("x")),
      remove: () => Promise.reject(new Error("x")),
      keys: () => Promise.reject(new Error("x")),
    };
    await reconcileQueues(local, broken, 1);
    expect(local.getItem(queueStorageKey("s1"))).toBe("[q]");
  });
});
