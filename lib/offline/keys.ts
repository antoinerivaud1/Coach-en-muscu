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
