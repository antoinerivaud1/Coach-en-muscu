// CM-90 (PR 1) : copie durable des files hors ligne.
//
// Logique pure : les deux stockages sont injectés, tout se teste en Node
// (tests/unit/durableQueues.spec.ts). Le branchement (localStorage + Capacitor
// Preferences) est dans lib/offline/queueStore.ts.
//
// Pourquoi deux stockages : `localStorage` est synchrone (la file des séries
// en dépend à chaque validation) mais iOS peut le purger sous pression de
// stockage. Preferences (UserDefaults) n'est pas purgé, mais il est
// asynchrone. Donc : `localStorage` reste la copie de travail, chaque
// écriture est recopiée dans Preferences, et au lancement on restaure ce que
// `localStorage` aurait perdu.

import { PURGE_MARKER_KEY, isQueueKey } from "@/lib/offline/keys";

/** Stockage synchrone de travail (`localStorage`, ou mémoire en test). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

/** Stockage durable asynchrone (Preferences dans l'app native). */
export interface DurableStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Valeur recopiée dans le stockage durable : la file et sa date d'écriture. */
export type DurableEntry = { v: string; at: number };

export function encodeDurable(value: string, at: number): string {
  return JSON.stringify({ v: value, at } satisfies DurableEntry);
}

/** Relit une entrée durable. Illisible : `null` (ignorée, jamais restaurée). */
export function decodeDurable(raw: string | null): DurableEntry | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const { v, at } = parsed as Record<string, unknown>;
    if (typeof v !== "string" || typeof at !== "number" || !Number.isFinite(at)) return null;
    return { v, at };
  } catch {
    return null;
  }
}

/** Date de la dernière purge lue dans le stockage de travail (0 : jamais). */
export function purgedAt(local: KeyValueStore): number {
  const raw = local.getItem(PURGE_MARKER_KEY);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Remet les deux stockages d'accord, au lancement, AVANT toute lecture des
 * files :
 *  - une file présente seulement dans la copie durable (localStorage purgé
 *    par iOS) est restaurée, sauf si elle date d'avant la dernière
 *    déconnexion (elle est alors effacée) ;
 *  - une file présente dans le stockage de travail est la plus récente : elle
 *    est (re)copiée dans le stockage durable. C'est aussi la migration des
 *    files existantes au premier lancement de cette version.
 *  - une copie durable antérieure à la purge, ou illisible, est effacée.
 *
 * Une file vidée normalement efface aussi sa copie durable (queueStore). Si
 * cet effacement a échoué, la file est restaurée et rejouée une fois de
 * trop : sans risque, chaque écriture est idempotente (ids créés sur le
 * téléphone, upsert, clôture = simple mise à jour).
 *
 * Ne lève jamais : un stockage en échec laisse simplement la file où elle est.
 */
export async function reconcileQueues(
  local: KeyValueStore,
  durable: DurableStore,
  now: number,
): Promise<void> {
  const purge = purgedAt(local);
  let durableKeys: string[] = [];
  try {
    durableKeys = (await durable.keys()).filter(isQueueKey);
  } catch {
    return;
  }
  const localKeys = new Set(local.keys().filter(isQueueKey));

  for (const key of durableKeys) {
    if (localKeys.has(key)) continue;
    let entry: DurableEntry | null = null;
    try {
      entry = decodeDurable(await durable.get(key));
    } catch {
      continue;
    }
    if (entry && entry.at > purge) {
      try {
        local.setItem(key, entry.v);
        localKeys.add(key);
      } catch {
        // Stockage de travail plein : la copie durable reste, rien n'est perdu.
      }
    } else {
      await durable.remove(key).catch(() => {});
    }
  }

  for (const key of localKeys) {
    const value = local.getItem(key);
    if (value === null) continue;
    await durable.set(key, encodeDurable(value, now)).catch(() => {});
  }
}
