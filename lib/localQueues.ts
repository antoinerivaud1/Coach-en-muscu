// CM-59 B : files locales (localStorage) liées au compte connecté. Purgées à
// la déconnexion, pour qu'un autre compte sur le même téléphone n'en hérite
// pas. Code navigateur uniquement ; chaque accès au stockage est protégé
// (navigation privée iOS, quota).

import { PENDING_SESSIONS_KEY, REFUSED_SESSIONS_KEY } from "@/lib/pendingSessions";
import { PENDING_SETS_PREFIX, REFUSED_SETS_PREFIX } from "@/lib/utils/setQueue";

function isQueueKey(key: string): boolean {
  return (
    key === PENDING_SESSIONS_KEY ||
    key === REFUSED_SESSIONS_KEY ||
    key.startsWith(PENDING_SETS_PREFIX) ||
    key.startsWith(REFUSED_SETS_PREFIX)
  );
}

function storageKeys(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key) keys.push(key);
    }
    return keys;
  } catch {
    return [];
  }
}

function entryCount(key: string): number {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Nombre d'entrées jamais arrivées en base (séries et clôtures en attente ou
 * refusées). 0 : la déconnexion ne perd rien.
 */
export function unsyncedLocalCount(): number {
  return storageKeys()
    .filter(isQueueKey)
    .reduce((n, key) => n + entryCount(key), 0);
}

/** Efface toutes les files locales du compte. */
export function purgeLocalQueues(): void {
  for (const key of storageKeys().filter(isQueueKey)) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Stockage indisponible : rien à effacer.
    }
  }
}
