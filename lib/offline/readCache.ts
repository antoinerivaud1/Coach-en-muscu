// CM-90 (PR 3) : cache de lecture persistant.
//
// Le cache TanStack Query (en mémoire) est recopié dans IndexedDB, puis
// restauré au lancement : accueil, Carnet, Stats, Guide, séances types et
// Profil s'affichent hors ligne dans leur dernier état connu. Ce n'est qu'un
// cache : s'il est vidé (iOS, navigation privée), tout est relu au prochain
// réseau. Les écritures en attente, elles, vivent dans les files durables
// (lib/offline/queueStore.ts).
//
// Ne sont PAS gardés : la session (`auth`), l'écran de séance (son propre
// cache, lib/offline/sessionCache.ts), l'éditeur de séance type (en ligne
// seulement), l'aperçu d'une invitation et l'email du compte.

import type { Query, QueryKey } from "@tanstack/react-query";
import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { del, get, set } from "idb-keyval";

/** Clé du cache dans IndexedDB. */
export const READ_CACHE_KEY = "cm-read-cache";

/** Au-delà, une copie n'est plus restaurée (et `gcTime` des lectures). */
export const READ_CACHE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Change à chaque build : une nouvelle version de l'app ne relit jamais un
 * cache écrit par l'ancienne (forme des données qui a pu changer).
 */
export const READ_CACHE_BUSTER = process.env.NEXT_PUBLIC_READ_CACHE_BUSTER ?? "dev";

/** Écrans gardés, par 2e élément de clé (`[profileId, tête, …]`, lib/data/queryKeys.ts). */
const PERSISTED_HEADS = new Set(["sessions", "profile", "duo", "exercises"]);

/** Sous `[profileId, "sessions"]` : jamais gardés. */
const EXCLUDED_SESSION_PARTS = new Set(["detail"]);

/**
 * Vrai si cette lecture doit survivre à la fermeture de l'app.
 * Pure : testée sans navigateur.
 */
export function isPersistedKey(key: QueryKey): boolean {
  if (key.length < 2 || typeof key[0] !== "string" || key[0] === "") return false;
  const head = key[1];
  if (typeof head !== "string" || !PERSISTED_HEADS.has(head)) return false;
  if (head === "sessions") {
    if (EXCLUDED_SESSION_PARTS.has(String(key[2]))) return false;
    // Éditeur de séance type : en ligne seulement.
    if (key[2] === "seances" && key[3] === "editor") return false;
  }
  return true;
}

/**
 * Une lecture est gardée dès qu'elle a des données, même si son dernier
 * rafraîchissement a échoué (hors ligne) : sinon la copie disparaîtrait
 * précisément quand on en a besoin.
 */
export function shouldPersistQuery(query: Pick<Query, "queryKey" | "state">): boolean {
  return query.state.data !== undefined && isPersistedKey(query.queryKey);
}

/**
 * « 13/10 à 18:42 » : date et heure locales de la dernière lecture réussie,
 * pour le bandeau hors ligne.
 */
export function formatDataStamp(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} à ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ce que le bandeau lit d'une requête TanStack Query. */
export type OfflineSource = {
  data: unknown;
  dataUpdatedAt: number;
  isRefetchError: boolean;
  status: string;
};

/**
 * Vrai si l'écran affiche des données d'une lecture qui n'a pas pu être
 * rafraîchie : téléphone hors ligne, ou dernier essai en échec. Pure.
 */
export function isShowingOfflineData(sources: readonly OfflineSource[], online: boolean): boolean {
  const withData = sources.filter((s) => s.data !== undefined);
  if (withData.length === 0) return false;
  return !online || withData.some((s) => s.isRefetchError || s.status === "error");
}

/** Plus ancienne date de lecture réussie parmi les données affichées. */
export function oldestDataStamp(sources: readonly OfflineSource[]): number | null {
  const stamps = sources
    .filter((s) => s.data !== undefined && s.dataUpdatedAt > 0)
    .map((s) => s.dataUpdatedAt);
  return stamps.length > 0 ? Math.min(...stamps) : null;
}

/** Message d'une lecture même pas tentée : le téléphone se sait hors ligne. */
export const OFFLINE_READ_ERROR = "Hors ligne";

/**
 * Pour les lectures qui, en échec, renvoient une valeur « dégradée » au lieu
 * de lever (badges à zéro, duo en erreur) : hors ligne, on lève avant de
 * lire, pour que la copie locale reste affichée au lieu d'être écrasée.
 */
export function throwIfKnownOffline(): void {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error(OFFLINE_READ_ERROR);
  }
}

function hasIndexedDb(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

// Après la purge (déconnexion), plus aucune recopie : une sauvegarde en
// attente ne doit pas réécrire le cache du compte qui part. La page est
// rechargée juste après, ce qui remet tout à zéro.
let purged = false;

/**
 * Persister IndexedDB, ou `null` sans IndexedDB (rendu serveur, navigateur
 * qui le refuse) : l'app fonctionne alors comme avant, cache en mémoire.
 */
export function createReadCachePersister(): Persister | null {
  if (typeof window === "undefined" || !hasIndexedDb()) return null;
  const inner = createAsyncStoragePersister({
    key: READ_CACHE_KEY,
    storage: {
      getItem: (key) => get<string>(key).then((v) => v ?? null),
      setItem: (key, value) => set(key, value),
      removeItem: (key) => del(key),
    },
  });
  return {
    persistClient: (client: PersistedClient) => (purged ? undefined : inner.persistClient(client)),
    restoreClient: () => (purged ? undefined : inner.restoreClient()),
    removeClient: () => inner.removeClient(),
  };
}

/** Efface le cache de lecture (déconnexion). Sans effet s'il n'existe pas. */
export function purgeReadCache(): void {
  purged = true;
  if (!hasIndexedDb()) return;
  void del(READ_CACHE_KEY).catch(() => {});
}
