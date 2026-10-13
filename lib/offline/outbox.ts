// CM-90 (PR 1) : rejeu ordonné de toutes les écritures hors ligne.
//
// Ordre garanti, séance par séance : démarrage → séries → clôture.
//  1. Démarrages (séance créée hors ligne, PR 2) : la séance doit exister en
//     base avant ses séries.
//  2. Séries : chaque file de séance non possédée par l'écran de saisie
//     (lib/offline/queueOwners.ts), dans l'ordre, jusqu'au premier échec.
//  3. Clôtures : seulement quand la séance n'a plus ni démarrage ni série en
//     attente (une séance n'est jamais close avant d'avoir reçu ses séries).
//
// Logique pure : stockage et écritures injectés (tests/unit/outbox.spec.ts).
// Règles de résultat inchangées (CM-59 B) : `refused` = définitif, mis de
// côté ; tout le reste (réseau, session expirée, 42501) est rejoué plus tard.

import type { ActionResult, FinishSessionInput } from "@/lib/data/sessionWrites";
import type { KeyValueStore } from "@/lib/offline/durableQueues";
import { PENDING_SETS_PREFIX, REFUSED_SETS_PREFIX } from "@/lib/offline/keys";
import {
  addRefusedStarts,
  getPendingStarts,
  getRefusedStarts,
  setPendingStarts,
  type PendingStart,
} from "@/lib/offline/pendingStarts";
import {
  addRefusedSessions,
  getPending,
  getRefusedSessions,
  setPending,
} from "@/lib/pendingSessions";
import {
  parseQueueSnapshot,
  queueStorageKey,
  refusedStorageKey,
  serializeQueue,
  type PendingSet,
  type QueuedOp,
} from "@/lib/utils/setQueue";

export interface OutboxDeps {
  store: KeyValueStore;
  /** Vrai si l'écran de saisie de cette séance envoie lui-même sa file. */
  isOwned(sessionId: string): boolean;
  startSession(start: PendingStart): Promise<ActionResult>;
  upsertSet(set: PendingSet): Promise<ActionResult>;
  deleteSet(input: { id: string; sessionId: string }): Promise<ActionResult>;
  finishSession(input: FinishSessionInput): Promise<ActionResult>;
}

export type OutboxReport = {
  /** Écritures confirmées pendant ce passage. */
  written: number;
};

type Outcome = "ok" | "refused" | "retry";

/** Une écriture qui lève (hors ligne) est simplement à rejouer. */
async function attempt(run: () => Promise<ActionResult>): Promise<Outcome> {
  try {
    const result = await run();
    if (result.ok) return "ok";
    return result.refused ? "refused" : "retry";
  } catch {
    return "retry";
  }
}

function sessionIdOfSetKey(key: string): string | null {
  if (!key.startsWith(PENDING_SETS_PREFIX)) return null;
  const id = key.slice(PENDING_SETS_PREFIX.length);
  return id === "" ? null : id;
}

function readSetQueue(store: KeyValueStore, sessionId: string): QueuedOp[] {
  try {
    return parseQueueSnapshot(store.getItem(queueStorageKey(sessionId)));
  } catch {
    return [];
  }
}

function writeSetQueue(store: KeyValueStore, sessionId: string, queue: QueuedOp[]): void {
  try {
    const key = queueStorageKey(sessionId);
    if (queue.length === 0) store.removeItem(key);
    else store.setItem(key, serializeQueue(queue));
  } catch {
    // Stockage indisponible : la file sera relue telle quelle au prochain passage.
  }
}

/** Série refusée : mise de côté. Une suppression refusée n'a rien à garder. */
function setAsideOp(store: KeyValueStore, sessionId: string, op: QueuedOp): void {
  if (op.kind !== "upsert") return;
  try {
    const key = refusedStorageKey(sessionId);
    const kept = parseQueueSnapshot(store.getItem(key));
    store.setItem(key, serializeQueue([...kept, { ...op, attempts: 0 }]));
  } catch {
    // Stockage plein : rien de mieux à faire.
  }
}

/** Séances dont une file de séries attend encore. */
export function sessionsWithPendingSets(store: KeyValueStore): string[] {
  let keys: string[] = [];
  try {
    keys = store.keys();
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const key of keys) {
    const id = sessionIdOfSetKey(key);
    if (id && readSetQueue(store, id).length > 0) out.push(id);
  }
  return out;
}

/** Un passage complet. Ne lève jamais. */
export async function replayOutbox(deps: OutboxDeps): Promise<OutboxReport> {
  const { store } = deps;
  let written = 0;

  // 1. Démarrages, dans l'ordre. Un démarrage en échec bloque la suite de SA
  // séance seulement (ses séries et sa clôture attendent).
  const blocked = new Set<string>();
  const remainingStarts: PendingStart[] = [];
  const refusedStarts: PendingStart[] = [];
  const initialStarts = getPendingStarts(store);
  const initialStartIds = new Set(initialStarts.map((s) => s.sessionId));
  for (const start of initialStarts) {
    const outcome = await attempt(() => deps.startSession(start));
    if (outcome === "ok") written += 1;
    else if (outcome === "refused") refusedStarts.push(start);
    else {
      remainingStarts.push(start);
      blocked.add(start.sessionId);
    }
  }
  // Un démarrage ajouté pendant ce passage n'est pas écrasé : il attend.
  const addedStarts = getPendingStarts(store).filter((s) => !initialStartIds.has(s.sessionId));
  for (const s of addedStarts) blocked.add(s.sessionId);
  setPendingStarts(store, [...remainingStarts, ...addedStarts]);
  addRefusedStarts(store, refusedStarts);

  // 2. Séries, file par file. Relues à chaque opération : l'écran de saisie a
  // pu reprendre la main entre-temps (il est alors sauté au tour suivant).
  for (const sessionId of sessionsWithPendingSets(store)) {
    if (blocked.has(sessionId)) continue;
    for (;;) {
      if (deps.isOwned(sessionId)) break;
      const queue = readSetQueue(store, sessionId);
      const op = queue[0];
      if (!op) break;
      const outcome = await attempt(() =>
        op.kind === "upsert"
          ? deps.upsertSet(op.set)
          : deps.deleteSet({ id: op.id, sessionId: op.sessionId }),
      );
      if (outcome === "retry") {
        blocked.add(sessionId);
        break;
      }
      if (outcome === "ok") written += 1;
      else setAsideOp(store, sessionId, op);
      // Retire l'opération envoyée : celle de tête, si elle est toujours là.
      const now = readSetQueue(store, sessionId);
      const head = now[0];
      const sameHead =
        head &&
        head.kind === op.kind &&
        (head.kind === "upsert" ? head.set.id : head.id) ===
          (op.kind === "upsert" ? op.set.id : op.id);
      writeSetQueue(store, sessionId, sameHead ? now.slice(1) : now);
    }
  }

  // 3. Clôtures : seulement les séances sans rien d'autre en attente.
  const stillPendingSets = new Set(sessionsWithPendingSets(store));
  const initial = getPending(store);
  const initialIds = new Set(initial.map((p) => p.sessionId));
  const remaining: FinishSessionInput[] = [];
  const refused: FinishSessionInput[] = [];
  for (const item of initial) {
    // Séries encore en file (y compris celles que l'écran envoie lui-même) :
    // la clôture attend le prochain passage.
    const waiting = blocked.has(item.sessionId) || stillPendingSets.has(item.sessionId);
    if (waiting) {
      remaining.push(item);
      continue;
    }
    const outcome = await attempt(() => deps.finishSession(item));
    if (outcome === "ok") written += 1;
    else if (outcome === "refused") refused.push(item);
    else remaining.push(item);
  }
  // Une clôture ajoutée pendant ce passage n'est pas écrasée : elle reste.
  const added = getPending(store).filter((p) => !initialIds.has(p.sessionId));
  setPending([...remaining, ...added], store);
  addRefusedSessions(refused, store);

  return { written };
}

export type OutboxCounts = {
  /** Écritures en attente, hors séances possédées par l'écran de saisie. */
  pending: number;
  /** Écritures refusées définitivement, mises de côté. */
  refused: number;
};

/** Compteurs de l'indicateur global « en attente de synchro ». */
export function outboxCounts(
  store: KeyValueStore,
  isOwned: (sessionId: string) => boolean,
): OutboxCounts {
  let pending = getPendingStarts(store).length + getPending(store).length;
  for (const sessionId of sessionsWithPendingSets(store)) {
    if (!isOwned(sessionId)) pending += readSetQueue(store, sessionId).length;
  }
  let refused = getRefusedStarts(store).length + getRefusedSessions(store).length;
  try {
    for (const key of store.keys()) {
      if (key.startsWith(REFUSED_SETS_PREFIX)) {
        refused += parseQueueSnapshot(store.getItem(key)).length;
      }
    }
  } catch {
    // Comptage partiel : sans gravité pour un indicateur.
  }
  return { pending, refused };
}
