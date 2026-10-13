// CM-90 (PR 1) : branchement des files hors ligne sur les stockages réels.
//
// - `queueStore()` : stockage synchrone de travail. `localStorage`, et dans
//   l'app native chaque écriture d'une file est recopiée dans Capacitor
//   Preferences (que iOS ne purge pas). Sans `localStorage` (navigation privée
//   iOS, rendu serveur) : mémoire, la saisie ne casse jamais.
// - `whenQueuesReady()` : à attendre AVANT de lire une file au lancement. Dans
//   l'app native, restaure ce que `localStorage` aurait perdu
//   (lib/offline/durableQueues.ts). Sur le web : résolu tout de suite.
// - Événement `QUEUE_CHANGED_EVENT` à chaque écriture d'une file, pour que
//   l'indicateur « en attente de synchro » se mette à jour.

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  encodeDurable,
  reconcileQueues,
  type DurableStore,
  type KeyValueStore,
} from "@/lib/offline/durableQueues";
import { PURGE_MARKER_KEY, isOfflineCacheKey, isQueueKey } from "@/lib/offline/keys";

export const QUEUE_CHANGED_EVENT = "cm:queues-changed";

/** Stockage en mémoire : tests unitaires et repli sans `localStorage`. */
export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
    keys: () => Array.from(data.keys()),
  };
}

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function browserLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    // Accès effectif : certains navigateurs exposent l'objet mais lèvent ici.
    storage.getItem(PURGE_MARKER_KEY);
    return storage;
  } catch {
    return null;
  }
}

function localStore(storage: Storage): KeyValueStore {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    keys: () => {
      const out: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key) out.push(key);
      }
      return out;
    },
  };
}

const preferencesStore: DurableStore = {
  get: async (key) => (await Preferences.get({ key })).value ?? null,
  set: (key, value) => Preferences.set({ key, value }),
  remove: (key) => Preferences.remove({ key }),
  keys: async () => (await Preferences.keys()).keys,
};

// Les recopies vers Preferences partent dans l'ordre, une à la fois : une
// suppression ne peut jamais doubler l'écriture qui la précède.
let mirrorChain: Promise<void> = Promise.resolve();
function mirror(task: () => Promise<void>): void {
  mirrorChain = mirrorChain.then(task).catch(() => {});
}

function notifyChanged(key: string): void {
  if (typeof window === "undefined" || !isQueueKey(key)) return;
  try {
    window.dispatchEvent(new Event(QUEUE_CHANGED_EVENT));
  } catch {
    // Pas d'événements (environnement inhabituel) : l'indicateur attendra.
  }
}

let fallback: KeyValueStore | null = null;
let cached: KeyValueStore | null = null;

/** Stockage des files hors ligne (voir l'en-tête). */
export function queueStore(): KeyValueStore {
  if (cached) return cached;
  const storage = browserLocalStorage();
  if (!storage) {
    fallback ??= memoryStore();
    return fallback;
  }
  const local = localStore(storage);
  const native = isNative();
  cached = {
    getItem: local.getItem,
    keys: local.keys,
    setItem(key, value) {
      local.setItem(key, value);
      if (native && isQueueKey(key)) {
        const encoded = encodeDurable(value, Date.now());
        mirror(() => preferencesStore.set(key, encoded));
      }
      notifyChanged(key);
    },
    removeItem(key) {
      local.removeItem(key);
      if (native && isQueueKey(key)) mirror(() => preferencesStore.remove(key));
      notifyChanged(key);
    },
  };
  return cached;
}

/** Délai maximal d'attente de la restauration au lancement. */
const RESTORE_TIMEOUT_MS = 2000;

let ready: Promise<void> | null = null;

/** Voir l'en-tête. Mémorisé : la restauration n'a lieu qu'une fois. */
export function whenQueuesReady(): Promise<void> {
  if (ready) return ready;
  const storage = browserLocalStorage();
  if (!storage || !isNative()) {
    ready = Promise.resolve();
    return ready;
  }
  const restore = reconcileQueues(localStore(storage), preferencesStore, Date.now());
  // Un plugin qui ne répond pas ne doit pas bloquer la saisie : au pire, on
  // travaille avec `localStorage` tel quel.
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, RESTORE_TIMEOUT_MS));
  ready = Promise.race([restore, timeout]).catch(() => {});
  return ready;
}

/**
 * Efface toutes les files du compte (déconnexion), dans les deux stockages.
 * Le marqueur de purge garantit qu'une copie durable dont l'effacement n'a pas
 * abouti avant le rechargement de la page ne sera jamais restaurée.
 */
export function purgeQueueStorage(): void {
  const store = queueStore();
  try {
    store.setItem(PURGE_MARKER_KEY, String(Date.now()));
  } catch {
    // Sans marqueur, l'effacement durable ci-dessous reste tenté.
  }
  // CM-90 (PR 2) : le cache hors ligne (packs, séance en cours, compte) part
  // aussi : un autre compte sur ce téléphone n'en voit rien.
  for (const key of store.keys().filter((k) => isQueueKey(k) || isOfflineCacheKey(k))) {
    try {
      store.removeItem(key);
    } catch {
      // Stockage indisponible : rien à effacer.
    }
  }
  if (isNative()) {
    mirror(async () => {
      const keys = (await preferencesStore.keys()).filter(isQueueKey);
      for (const key of keys) await preferencesStore.remove(key);
    });
  }
}
