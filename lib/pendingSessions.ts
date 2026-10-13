import type { FinishSessionInput } from "@/lib/data/sessionWrites";
import type { KeyValueStore } from "@/lib/offline/durableQueues";
import { PENDING_SESSIONS_KEY, REFUSED_SESSIONS_KEY } from "@/lib/offline/keys";
import { queueStore } from "@/lib/offline/queueStore";

/**
 * Clôtures de séance faites hors ligne, rejouées par `PendingSync`
 * (lib/offline/outbox.ts depuis CM-90).
 *
 * CM-90 (PR 1) : stockage via `queueStore()` (localStorage recopié dans
 * Preferences sur iPhone). Le `store` est injectable pour les tests.
 */
export { PENDING_SESSIONS_KEY, REFUSED_SESSIONS_KEY };

function read(store: KeyValueStore, key: string): FinishSessionInput[] {
  try {
    const raw = store.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as FinishSessionInput[]) : [];
  } catch {
    return [];
  }
}

function write(store: KeyValueStore, key: string, items: FinishSessionInput[]): void {
  try {
    if (items.length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify(items));
  } catch {
    // Stockage indisponible (quota, navigation privée) : rien de mieux à faire.
  }
}

export function getPending(store: KeyValueStore = queueStore()): FinishSessionInput[] {
  return read(store, PENDING_SESSIONS_KEY);
}

export function setPending(
  items: FinishSessionInput[],
  store: KeyValueStore = queueStore(),
): void {
  write(store, PENDING_SESSIONS_KEY, items);
}

export function addPending(item: FinishSessionInput, store: KeyValueStore = queueStore()): void {
  setPending([...getPending(store), item], store);
}

/**
 * CM-88 (PR 6) : clôture de cette séance enregistrée hors ligne, pas encore
 * rejouée. L'accueil ne propose alors pas de la « Reprendre » : elle est
 * terminée pour l'utilisateur, seule son écriture attend le réseau.
 */
export function hasPendingClosure(sessionId: string, store: KeyValueStore = queueStore()): boolean {
  return getPending(store).some((p) => p.sessionId === sessionId);
}

/**
 * CM-59 B : clôtures refusées définitivement par le serveur (séance
 * introuvable ou pas à toi). Mises de côté au lieu d'être jetées en silence.
 */
export function getRefusedSessions(store: KeyValueStore = queueStore()): FinishSessionInput[] {
  return read(store, REFUSED_SESSIONS_KEY);
}

export function addRefusedSessions(
  items: FinishSessionInput[],
  store: KeyValueStore = queueStore(),
): void {
  if (items.length === 0) return;
  write(store, REFUSED_SESSIONS_KEY, [...getRefusedSessions(store), ...items]);
}
