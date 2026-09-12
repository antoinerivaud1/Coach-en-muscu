// File d'écriture des séries (CM-78) — logique pure, sans React ni I/O.
//
// Chaque série validée est écrite immédiatement, une opération à la fois, dans
// l'ordre. Ce module contient tout ce qui est testable seul : la mise en file,
// le backoff, la sérialisation vers `localStorage` et sa relecture défensive.
// Le hook `useSetPersistence` n'ajoute que le pilotage (effets, timers, appels
// server actions).

/** Série telle qu'envoyée au serveur. L'`id` est généré côté client. */
export interface PendingSet {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  rpe: number | null;
}

export type QueuedOp =
  | { kind: "upsert"; set: PendingSet; attempts: number }
  | { kind: "delete"; id: string; sessionId: string; attempts: number };

/** Préfixe commun des files d'écriture, une par séance. */
export const PENDING_SETS_PREFIX = "cm:pendingSets:";

/** Clé `localStorage` de la file d'une séance. */
export function queueStorageKey(sessionId: string): string {
  return `${PENDING_SETS_PREFIX}${sessionId}`;
}

/** Id de la série visée par l'opération. */
export function opSetId(op: QueuedOp): string {
  return op.kind === "upsert" ? op.set.id : op.id;
}

/**
 * Ajoute une opération à la file.
 *
 * Deux règles, et deux seulement :
 *  - deux `upsert` successifs sur la même série n'en font qu'un, à la place du
 *    premier : corriger deux fois la même série n'envoie pas deux écritures,
 *    et la position dans la file ne bouge pas ;
 *  - toute autre opération est ajoutée à la fin. Un `delete` reste donc
 *    toujours après l'`upsert` de la même série, jamais l'inverse.
 *
 * `lockedCount` protège les opérations déjà parties sur le réseau (en pratique
 * la tête de file) : elles ne sont jamais remplacées, sinon la confirmation
 * retirerait une opération plus récente qui n'a pas été envoyée.
 */
export function enqueueOp(
  queue: readonly QueuedOp[],
  op: QueuedOp,
  lockedCount = 0,
): QueuedOp[] {
  if (op.kind === "upsert") {
    const id = op.set.id;
    // Dernière opération connue sur cette série : on ne fusionne que si c'est
    // un upsert modifiable (hors zone verrouillée).
    for (let i = queue.length - 1; i >= lockedCount; i -= 1) {
      const existing = queue[i]!;
      if (opSetId(existing) !== id) continue;
      if (existing.kind !== "upsert") break;
      const next = [...queue];
      next[i] = op;
      return next;
    }
  }
  return [...queue, op];
}

/** Retire la tête de file (opération confirmée par le serveur). */
export function shiftQueue(queue: readonly QueuedOp[]): QueuedOp[] {
  return queue.slice(1);
}

/** Incrémente le compteur d'échecs de la tête de file. */
export function markHeadFailed(queue: readonly QueuedOp[]): QueuedOp[] {
  const head = queue[0];
  if (!head) return [...queue];
  const next = [...queue];
  next[0] = { ...head, attempts: head.attempts + 1 };
  return next;
}

/**
 * Délai avant le prochain essai, en millisecondes : 1 s, 3 s, 10 s, puis
 * toutes les 30 s. `attempts` est le nombre d'échecs consécutifs déjà subis
 * par l'opération (1 après le premier échec).
 */
export function backoffDelay(attempts: number): number {
  if (attempts <= 1) return 1000;
  if (attempts === 2) return 3000;
  if (attempts === 3) return 10000;
  return 30000;
}

/**
 * Ids des séries encore en attente d'écriture. Une suppression n'y figure pas :
 * sa ligne a déjà disparu de l'écran, il n'y a plus de pastille à afficher.
 */
export function pendingIdsOf(queue: readonly QueuedOp[]): Set<string> {
  const ids = new Set<string>();
  for (const op of queue) {
    if (op.kind === "upsert") ids.add(op.set.id);
  }
  return ids;
}

/**
 * État des séries tel que la file le décrit, une fois toutes ses opérations
 * appliquées dans l'ordre : la dernière opération sur une série l'emporte.
 *
 * Sert à réafficher, à la réouverture d'une séance, les séries validées hors
 * réseau qui ne sont pas encore en base. Sans ça l'écran les reproposerait à la
 * saisie et la même série finirait écrite deux fois.
 */
export function restoredSets(queue: readonly QueuedOp[]): PendingSet[] {
  const order: string[] = [];
  const latest = new Map<string, PendingSet | null>();
  for (const op of queue) {
    const id = opSetId(op);
    if (!latest.has(id)) order.push(id);
    latest.set(id, op.kind === "upsert" ? op.set : null);
  }
  const out: PendingSet[] = [];
  for (const id of order) {
    const set = latest.get(id);
    if (set) out.push(set);
  }
  return out;
}

/**
 * Séries que la file finira par supprimer. Une série supprimée hors réseau est
 * peut-être encore en base : elle ne doit pas réapparaître à la réouverture,
 * sinon l'écran affiche une ligne que la file est en train d'effacer.
 */
export function restoredDeletedIds(queue: readonly QueuedOp[]): Set<string> {
  const latest = new Map<string, boolean>();
  for (const op of queue) latest.set(opSetId(op), op.kind === "delete");
  const out = new Set<string>();
  for (const [id, isDelete] of latest) {
    if (isDelete) out.add(id);
  }
  return out;
}

export function serializeQueue(queue: readonly QueuedOp[]): string {
  return JSON.stringify(queue);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseSet(value: unknown): PendingSet | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || raw.id === "") return null;
  if (typeof raw.sessionId !== "string" || raw.sessionId === "") return null;
  if (typeof raw.exerciseId !== "string" || raw.exerciseId === "") return null;
  if (!isFiniteNumber(raw.setIndex)) return null;
  if (!isFiniteNumber(raw.weightKg)) return null;
  if (!isFiniteNumber(raw.reps)) return null;
  if (typeof raw.isWarmup !== "boolean") return null;
  const rpe = raw.rpe;
  return {
    id: raw.id,
    sessionId: raw.sessionId,
    exerciseId: raw.exerciseId,
    setIndex: raw.setIndex,
    weightKg: raw.weightKg,
    reps: raw.reps,
    isWarmup: raw.isWarmup,
    rpe: isFiniteNumber(rpe) ? rpe : null,
  };
}

/**
 * Relit une file depuis un instantané `localStorage`. Tolérante : une entrée
 * illisible est ignorée, un instantané corrompu rend une file vide. Les
 * compteurs d'échecs repartent de zéro, la page vient de s'ouvrir.
 */
export function parseQueueSnapshot(raw: string | null): QueuedOp[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out: QueuedOp[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const raw2 = entry as Record<string, unknown>;
    if (raw2.kind === "upsert") {
      const set = parseSet(raw2.set);
      if (set) out.push({ kind: "upsert", set, attempts: 0 });
    } else if (raw2.kind === "delete") {
      if (typeof raw2.id !== "string" || raw2.id === "") continue;
      if (typeof raw2.sessionId !== "string" || raw2.sessionId === "") continue;
      out.push({
        kind: "delete",
        id: raw2.id,
        sessionId: raw2.sessionId,
        attempts: 0,
      });
    }
  }
  return out;
}

/**
 * Id de série généré côté client, pour qu'un réessai rejoue exactement la même
 * ligne (`upsert on conflict id`). `crypto.randomUUID` n'existe qu'en contexte
 * sécurisé : on retombe sur `getRandomValues`, présent partout où l'app tourne.
 */
export function newSetId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
