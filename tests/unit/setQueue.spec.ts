import { test, expect } from "@playwright/test";
import {
  backoffDelay,
  enqueueOp,
  markHeadFailed,
  newSetId,
  opSetId,
  parseQueueSnapshot,
  pendingIdsOf,
  queueStorageKey,
  serializeQueue,
  shiftQueue,
  type PendingSet,
  type QueuedOp,
} from "@/lib/utils/setQueue";

// Tests unitaires purs (CM-78) : aucun navigateur, aucune donnée Supabase.
// Lancer : npm run test:unit

function aSet(id: string, over: Partial<PendingSet> = {}): PendingSet {
  return {
    id,
    sessionId: "sess-1",
    exerciseId: "ex-1",
    setIndex: 1,
    weightKg: 60,
    reps: 10,
    isWarmup: false,
    rpe: null,
    ...over,
  };
}

const upsert = (set: PendingSet): QueuedOp => ({
  kind: "upsert",
  set,
  attempts: 0,
});
const del = (id: string): QueuedOp => ({
  kind: "delete",
  id,
  sessionId: "sess-1",
  attempts: 0,
});

// ---------- Ordre de la file ----------

test("les séries partent dans l'ordre de validation", () => {
  let q: QueuedOp[] = [];
  q = enqueueOp(q, upsert(aSet("a", { setIndex: 1 })));
  q = enqueueOp(q, upsert(aSet("b", { setIndex: 2 })));
  q = enqueueOp(q, upsert(aSet("c", { setIndex: 3 })));
  expect(q.map(opSetId)).toEqual(["a", "b", "c"]);
});

test("un delete reste après l'upsert de la même série", () => {
  let q: QueuedOp[] = [];
  q = enqueueOp(q, upsert(aSet("a")));
  q = enqueueOp(q, del("a"));
  expect(q.map((op) => op.kind)).toEqual(["upsert", "delete"]);
  expect(q.map(opSetId)).toEqual(["a", "a"]);
});

test("un upsert après un delete de la même série est ajouté à la fin", () => {
  let q: QueuedOp[] = [];
  q = enqueueOp(q, upsert(aSet("a")));
  q = enqueueOp(q, del("a"));
  q = enqueueOp(q, upsert(aSet("a", { reps: 12 })));
  expect(q.map((op) => op.kind)).toEqual(["upsert", "delete", "upsert"]);
});

test("deux corrections de la même série ne font qu'une écriture, à sa place", () => {
  let q: QueuedOp[] = [];
  q = enqueueOp(q, upsert(aSet("a", { reps: 8 })));
  q = enqueueOp(q, upsert(aSet("b")));
  q = enqueueOp(q, upsert(aSet("a", { reps: 12 })));
  expect(q).toHaveLength(2);
  expect(q.map(opSetId)).toEqual(["a", "b"]);
  const head = q[0];
  expect(head?.kind).toBe("upsert");
  expect(head?.kind === "upsert" ? head.set.reps : null).toBe(12);
});

test("l'opération déjà partie sur le réseau n'est jamais remplacée", () => {
  let q: QueuedOp[] = [upsert(aSet("a", { reps: 8 }))];
  q = enqueueOp(q, upsert(aSet("a", { reps: 12 })), 1);
  expect(q).toHaveLength(2);
  expect(q[0]?.kind === "upsert" ? q[0].set.reps : null).toBe(8);
  expect(q[1]?.kind === "upsert" ? q[1].set.reps : null).toBe(12);
});

test("une confirmation retire la tête, un échec l'incrémente sans la perdre", () => {
  const q: QueuedOp[] = [upsert(aSet("a")), upsert(aSet("b"))];
  expect(shiftQueue(q).map(opSetId)).toEqual(["b"]);
  const failed = markHeadFailed(q);
  expect(failed).toHaveLength(2);
  expect(failed[0]?.attempts).toBe(1);
  expect(markHeadFailed(failed)[0]?.attempts).toBe(2);
  expect(markHeadFailed([])).toEqual([]);
});

// ---------- Backoff ----------

test("backoff : 1 s, 3 s, 10 s, puis 30 s sans fin", () => {
  expect(backoffDelay(1)).toBe(1000);
  expect(backoffDelay(2)).toBe(3000);
  expect(backoffDelay(3)).toBe(10000);
  expect(backoffDelay(4)).toBe(30000);
  expect(backoffDelay(42)).toBe(30000);
});

test("backoff : un compteur incohérent retombe sur le premier délai", () => {
  expect(backoffDelay(0)).toBe(1000);
  expect(backoffDelay(-3)).toBe(1000);
});

// ---------- Pastille d'attente ----------

test("seules les séries en attente d'écriture portent une pastille", () => {
  const ids = pendingIdsOf([upsert(aSet("a")), del("b"), upsert(aSet("c"))]);
  expect([...ids].sort()).toEqual(["a", "c"]);
  expect(pendingIdsOf([]).size).toBe(0);
});

// ---------- Instantané localStorage ----------

test("la clé de stockage est propre à la séance", () => {
  expect(queueStorageKey("sess-1")).toBe("cm:pendingSets:sess-1");
});

test("une file rechargée depuis un instantané garde son contenu et son ordre", () => {
  const q: QueuedOp[] = [
    { kind: "upsert", set: aSet("a", { setIndex: 2, rpe: 8 }), attempts: 2 },
    del("b"),
  ];
  const back = parseQueueSnapshot(serializeQueue(q));
  expect(back).toHaveLength(2);
  expect(back.map(opSetId)).toEqual(["a", "b"]);
  expect(back[0]?.kind === "upsert" ? back[0].set : null).toEqual(
    aSet("a", { setIndex: 2, rpe: 8 }),
  );
  // La page vient de s'ouvrir : le réessai repart du premier délai.
  expect(back[0]?.attempts).toBe(0);
});

test("une file vide ne laisse rien à recharger", () => {
  expect(serializeQueue([])).toBe("[]");
  expect(parseQueueSnapshot("[]")).toEqual([]);
  expect(parseQueueSnapshot(null)).toEqual([]);
});

test("un instantané corrompu ou incomplet n'empêche pas la séance de s'ouvrir", () => {
  expect(parseQueueSnapshot("{pas du json")).toEqual([]);
  expect(parseQueueSnapshot('{"kind":"upsert"}')).toEqual([]);
  expect(parseQueueSnapshot('[{"kind":"autre"}]')).toEqual([]);
  // Entrée illisible ignorée, entrée valide conservée.
  const mixed = parseQueueSnapshot(
    JSON.stringify([
      { kind: "upsert", set: { id: "x" }, attempts: 0 },
      { kind: "delete", id: "b", sessionId: "sess-1", attempts: 0 },
    ]),
  );
  expect(mixed.map(opSetId)).toEqual(["b"]);
});

// ---------- Ids clients ----------

test("chaque série reçoit un id client unique au format uuid", () => {
  const a = newSetId();
  const b = newSetId();
  expect(a).not.toBe(b);
  expect(a).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
});
