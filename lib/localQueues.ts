// CM-59 B : files locales liées au compte connecté. Purgées à la déconnexion,
// pour qu'un autre compte sur le même téléphone n'en hérite pas. Code
// navigateur uniquement ; chaque accès au stockage est protégé (navigation
// privée iOS, quota).
//
// CM-90 (PR 1) : clés centralisées (lib/offline/keys.ts) et purge des deux
// stockages (localStorage + Preferences sur iPhone, lib/offline/queueStore.ts).

import { isQueueKey } from "@/lib/offline/keys";
import { purgeQueueStorage, queueStore } from "@/lib/offline/queueStore";

function entryCount(key: string): number {
  try {
    const parsed: unknown = JSON.parse(queueStore().getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Nombre d'entrées jamais arrivées en base (démarrages, séries et clôtures en
 * attente ou refusés). 0 : la déconnexion ne perd rien.
 */
export function unsyncedLocalCount(): number {
  let keys: string[] = [];
  try {
    keys = queueStore().keys();
  } catch {
    return 0;
  }
  return keys.filter(isQueueKey).reduce((n, key) => n + entryCount(key), 0);
}

/** Efface toutes les files locales du compte. */
export function purgeLocalQueues(): void {
  purgeQueueStorage();
}
