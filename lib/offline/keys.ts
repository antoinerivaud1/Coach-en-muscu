// CM-90 (PR 1) : clés de toutes les files d'écriture hors ligne, au même
// endroit. Logique pure, sans I/O : importable partout sans cycle.

/** Clôtures de séance en attente (CM-18), rejouées par `PendingSync`. */
export const PENDING_SESSIONS_KEY = "cm_pending_sessions";

/** Clôtures refusées définitivement (CM-59 B), mises de côté. */
export const REFUSED_SESSIONS_KEY = "cm_refused_sessions";

/** Démarrages de séance faits hors ligne (CM-90), à créer en base en premier. */
export const PENDING_STARTS_KEY = "cm_pending_starts";

/** Démarrages refusés définitivement, mis de côté. */
export const REFUSED_STARTS_KEY = "cm_refused_starts";

/** Préfixe des files de séries, une par séance (CM-78). */
export const PENDING_SETS_PREFIX = "cm:pendingSets:";

/** Préfixe des séries refusées définitivement, une clé par séance (CM-59 B). */
export const REFUSED_SETS_PREFIX = "cm:refusedSets:";

/**
 * Date (ms) de la dernière purge des files (déconnexion). Une copie durable
 * plus ancienne n'est jamais restaurée : un autre compte n'hérite de rien.
 * Pas une file : jamais comptée, jamais purgée.
 */
export const PURGE_MARKER_KEY = "cm_queues_purged_at";

/** CM-90 (PR 2) : pack séance par séance type (cache, reconstructible). */
export const OFFLINE_PACK_PREFIX = "cm_offline_pack:";

/** CM-90 (PR 2) : séance en cours reconstructible hors ligne (cache). */
export const OFFLINE_SESSION_PREFIX = "cm_offline_session:";

/** CM-90 (PR 2) : dernier compte connu, pour les écrans hors ligne. */
export const LAST_PROFILE_KEY = "cm_last_profile_id";

/**
 * Cache hors ligne du compte connecté : jamais compté comme « non envoyé »,
 * mais effacé à la déconnexion avec les files.
 */
export function isOfflineCacheKey(key: string): boolean {
  return (
    key === LAST_PROFILE_KEY ||
    key.startsWith(OFFLINE_PACK_PREFIX) ||
    key.startsWith(OFFLINE_SESSION_PREFIX)
  );
}

/** Clé d'une file (en attente OU mise de côté) liée au compte connecté. */
export function isQueueKey(key: string): boolean {
  return (
    key === PENDING_SESSIONS_KEY ||
    key === REFUSED_SESSIONS_KEY ||
    key === PENDING_STARTS_KEY ||
    key === REFUSED_STARTS_KEY ||
    key.startsWith(PENDING_SETS_PREFIX) ||
    key.startsWith(REFUSED_SETS_PREFIX)
  );
}

/** Clé d'une file encore à envoyer (hors mises de côté). */
export function isPendingQueueKey(key: string): boolean {
  return (
    key === PENDING_SESSIONS_KEY ||
    key === PENDING_STARTS_KEY ||
    key.startsWith(PENDING_SETS_PREFIX)
  );
}
