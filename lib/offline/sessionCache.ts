// CM-90 (PR 2) : cache local qui permet de DÉMARRER et de ROUVRIR une séance
// sans réseau.
//
// - Pack séance (`cm_offline_pack:<profil>:<séance type>`) : préparé en ligne
//   depuis l'accueil, c'est l'écran de saisie d'une séance neuve, prêt à
//   l'emploi (lib/data/sessionDetail.ts, `fetchDayPack`).
// - Séance en cours (`cm_offline_session:<séance>`) : la dernière lecture de
//   l'écran de saisie (ou le pack au démarrage hors ligne), plus le journal des
//   séries CONFIRMÉES depuis. Rouverte sans réseau, la séance affiche ainsi
//   toutes ses séries : celles en base (lecture + journal) et celles encore en
//   file (le logger les rajoute lui-même, CM-78).
//
// Logique pure, stockage injecté (tests/unit/sessionCache.spec.ts). Un cache :
// illisible ou absent, il est simplement ignoré, jamais fatal.

import type { InitialSet, LoggerData } from "@/lib/data/sessionDetail";
import type { KeyValueStore } from "@/lib/offline/durableQueues";
import { LAST_PROFILE_KEY, OFFLINE_PACK_PREFIX, OFFLINE_SESSION_PREFIX } from "@/lib/offline/keys";
import { EXTRA_EXERCISE_DEFAULTS } from "@/lib/utils/sessionExercises";
import {
  parseQueueSnapshot,
  queueStorageKey,
  restoredDeletedIds,
  restoredSets,
  type PendingSet,
} from "@/lib/utils/setQueue";
import { formatWeight } from "@/lib/utils/training";

/** Écriture de série confirmée par le serveur, dans l'ordre. */
export type JournalOp = { kind: "upsert"; set: PendingSet } | { kind: "delete"; id: string };

export type ActiveSessionSnapshot = {
  profileId: string;
  data: LoggerData;
  journal: JournalOp[];
  savedAt: number;
};

type StoredPack = { profileId: string; data: LoggerData; savedAt: number };

/** Nombre de séances en cours gardées au plus (les plus récentes). */
export const MAX_ACTIVE_SNAPSHOTS = 3;

export function packKey(profileId: string, dayId: string): string {
  return `${OFFLINE_PACK_PREFIX}${profileId}:${dayId}`;
}

export function activeSessionKey(sessionId: string): string {
  return `${OFFLINE_SESSION_PREFIX}${sessionId}`;
}

function readJson(store: KeyValueStore, key: string): unknown {
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeJson(store: KeyValueStore, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Quota plein : sans cache, l'app marche en ligne comme avant.
  }
}

/** Contrôle minimal de forme : de quoi ne jamais planter l'écran de saisie. */
export function isLoggerData(value: unknown): value is LoggerData {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.kind === "logger" &&
    typeof v.sessionId === "string" &&
    typeof v.dayName === "string" &&
    typeof v.startedAt === "string" &&
    Array.isArray(v.exercises) &&
    typeof v.initialSets === "object" &&
    v.initialSets !== null &&
    Array.isArray(v.catalog)
  );
}

// ---------------------------------------------------------------------------
// Packs séance
// ---------------------------------------------------------------------------

export function savePack(
  store: KeyValueStore,
  profileId: string,
  dayId: string,
  data: LoggerData,
  now: number,
): void {
  writeJson(store, packKey(profileId, dayId), { profileId, data, savedAt: now } satisfies StoredPack);
}

export function readPack(store: KeyValueStore, profileId: string, dayId: string): LoggerData | null {
  const raw = readJson(store, packKey(profileId, dayId)) as Partial<StoredPack> | null;
  if (!raw || raw.profileId !== profileId || !isLoggerData(raw.data)) return null;
  return raw.data;
}

/** Date d'enregistrement d'un pack (0 : absent), pour ne pas tout relire à chaque visite. */
export function packSavedAt(store: KeyValueStore, profileId: string, dayId: string): number {
  const raw = readJson(store, packKey(profileId, dayId)) as Partial<StoredPack> | null;
  return typeof raw?.savedAt === "number" ? raw.savedAt : 0;
}

/** Retire les packs des séances types qui n'existent plus pour ce compte. */
export function prunePacks(store: KeyValueStore, profileId: string, keepDayIds: Iterable<string>): void {
  const keep = new Set(Array.from(keepDayIds, (id) => packKey(profileId, id)));
  const prefix = `${OFFLINE_PACK_PREFIX}${profileId}:`;
  let keys: string[] = [];
  try {
    keys = store.keys();
  } catch {
    return;
  }
  for (const key of keys) {
    if (key.startsWith(prefix) && !keep.has(key)) {
      try {
        store.removeItem(key);
      } catch {
        // Rien de grave : un pack orphelin n'est jamais proposé.
      }
    }
  }
}

/** Séance neuve démarrée hors ligne, à partir du pack de sa séance type. */
export function offlineSessionFromPack(pack: LoggerData, sessionId: string, startedAt: string): LoggerData {
  return {
    ...pack,
    sessionId,
    startedAt,
    finishedDurationSeconds: null,
    initialFeedback: null,
  };
}

// ---------------------------------------------------------------------------
// Séance en cours
// ---------------------------------------------------------------------------

function readSnapshot(store: KeyValueStore, sessionId: string): ActiveSessionSnapshot | null {
  const raw = readJson(store, activeSessionKey(sessionId)) as Partial<ActiveSessionSnapshot> | null;
  if (!raw || typeof raw.profileId !== "string" || !isLoggerData(raw.data)) return null;
  if (raw.data.sessionId !== sessionId) return null;
  return {
    profileId: raw.profileId,
    data: raw.data,
    journal: Array.isArray(raw.journal) ? raw.journal : [],
    savedAt: typeof raw.savedAt === "number" ? raw.savedAt : 0,
  };
}

/** Garde au plus `MAX_ACTIVE_SNAPSHOTS` séances, les plus récentes. */
function pruneActiveSessions(store: KeyValueStore): void {
  let keys: string[] = [];
  try {
    keys = store.keys().filter((k) => k.startsWith(OFFLINE_SESSION_PREFIX));
  } catch {
    return;
  }
  if (keys.length <= MAX_ACTIVE_SNAPSHOTS) return;
  const dated = keys.map((key) => {
    const raw = readJson(store, key) as Partial<ActiveSessionSnapshot> | null;
    return { key, at: typeof raw?.savedAt === "number" ? raw.savedAt : 0 };
  });
  dated.sort((a, b) => b.at - a.at);
  for (const { key } of dated.slice(MAX_ACTIVE_SNAPSHOTS)) {
    try {
      store.removeItem(key);
    } catch {
      // Rien de grave.
    }
  }
}

/**
 * Enregistre la séance telle que l'écran de saisie vient de la lire (ou telle
 * que démarrée hors ligne). Repart d'un journal vide : la lecture contient
 * déjà tout ce qui est en base.
 */
export function saveActiveSession(
  store: KeyValueStore,
  profileId: string,
  data: LoggerData,
  now: number,
): void {
  writeJson(store, activeSessionKey(data.sessionId), {
    profileId,
    data,
    journal: [],
    savedAt: now,
  } satisfies ActiveSessionSnapshot);
  pruneActiveSessions(store);
}

/** Note une écriture de série confirmée, si la séance est en cache. */
export function recordConfirmed(store: KeyValueStore, sessionId: string, op: JournalOp): void {
  const snapshot = readSnapshot(store, sessionId);
  if (!snapshot) return;
  writeJson(store, activeSessionKey(sessionId), { ...snapshot, journal: [...snapshot.journal, op] });
}

export function dropActiveSession(store: KeyValueStore, sessionId: string): void {
  try {
    store.removeItem(activeSessionKey(sessionId));
  } catch {
    // Rien de grave : le cache expire avec les suivants.
  }
}

/**
 * Séance en cours reconstruite hors ligne : la lecture enregistrée, plus les
 * séries confirmées depuis. `null` sans cache (ou d'un autre compte).
 */
export function readActiveSession(
  store: KeyValueStore,
  sessionId: string,
  profileId: string | null,
): { profileId: string; data: LoggerData } | null {
  const snapshot = readSnapshot(store, sessionId);
  if (!snapshot) return null;
  if (profileId && snapshot.profileId !== profileId) return null;
  return { profileId: snapshot.profileId, data: applyJournal(snapshot.data, snapshot.journal) };
}

function blankRow(): InitialSet {
  return { id: null, setIndex: null, weight: "", reps: "", isWarmup: false };
}

/**
 * Applique le journal à une lecture : chaque série confirmée prend sa place de
 * série faite (à la suite des séries déjà faites de son exercice), une série
 * supprimée disparaît. Un exercice ajouté en cours de séance (absent de la
 * lecture) est recréé depuis le catalogue, comme le fait le logger pour la
 * file (CM-62). Exporté pour les tests.
 */
export function applyJournal(data: LoggerData, journal: readonly JournalOp[]): LoggerData {
  if (journal.length === 0) return data;
  const exercises = [...data.exercises];
  const initialSets: Record<string, InitialSet[]> = {};
  for (const [exId, rows] of Object.entries(data.initialSets)) initialSets[exId] = [...rows];

  for (const op of journal) {
    if (op.kind === "delete") {
      for (const exId of Object.keys(initialSets)) {
        initialSets[exId] = initialSets[exId]!.filter((r) => r.id !== op.id);
      }
      continue;
    }
    const set = op.set;
    let rows = initialSets[set.exerciseId];
    if (!rows) {
      const known = data.catalog.find((c) => c.id === set.exerciseId);
      if (!known) continue;
      exercises.push({
        exerciseId: known.id,
        name: known.name,
        muscleGroup: known.muscle_group,
        ...EXTRA_EXERCISE_DEFAULTS,
        source: "extra",
        last: null,
      });
      rows = Array.from({ length: EXTRA_EXERCISE_DEFAULTS.targetSets }, blankRow);
    }
    const row: InitialSet = {
      id: set.id,
      setIndex: set.setIndex,
      weight: formatWeight(set.weightKg),
      reps: String(set.reps),
      isWarmup: set.isWarmup,
    };
    const existing = rows.findIndex((r) => r.id === set.id);
    if (existing >= 0) {
      rows[existing] = row;
    } else {
      const cursor = rows.filter((r) => r.id !== null).length;
      if (cursor < rows.length && rows[cursor]!.id === null) rows[cursor] = row;
      else rows.splice(cursor, 0, row);
      // La ligne suivante hérite de cette série, comme pendant la saisie.
      const next = rows[cursor + 1];
      if (next && next.id === null && !set.isWarmup) {
        rows[cursor + 1] = { ...next, weight: row.weight, reps: row.reps };
      }
    }
    initialSets[set.exerciseId] = rows;
  }
  return { ...data, exercises, initialSets };
}

/** Séance en cours gardée sur le téléphone, pour le bandeau « Reprendre ». */
export type LocalSession = {
  sessionId: string;
  dayName: string;
  startedAt: string;
  /** Séries faites : confirmées (lecture + journal) et encore en file. */
  setCount: number;
};

/**
 * CM-90 (PR 4) : séance en cours la plus récente de ce compte gardée sur le
 * téléphone. L'accueil hors ligne (copie locale) ou une séance démarrée hors
 * ligne (pas encore en base) ne la connaissent pas : sans ça, l'app relancée
 * en pleine séance n'aurait aucun « Reprendre ». `exclude` : séances déjà
 * closes côté téléphone (clôture en file).
 */
export function latestLocalSession(
  store: KeyValueStore,
  profileId: string,
  exclude: (sessionId: string) => boolean = () => false,
): LocalSession | null {
  let keys: string[] = [];
  try {
    keys = store.keys().filter((k) => k.startsWith(OFFLINE_SESSION_PREFIX));
  } catch {
    return null;
  }
  let best: ActiveSessionSnapshot | null = null;
  for (const key of keys) {
    const snapshot = readSnapshot(store, key.slice(OFFLINE_SESSION_PREFIX.length));
    if (!snapshot || snapshot.profileId !== profileId) continue;
    if (snapshot.data.finishedDurationSeconds !== null || exclude(snapshot.data.sessionId)) continue;
    if (!best || snapshot.savedAt > best.savedAt) best = snapshot;
  }
  if (!best) return null;

  const { sessionId, dayName, startedAt } = best.data;
  const applied = applyJournal(best.data, best.journal);
  const done = new Set<string>();
  for (const rows of Object.values(applied.initialSets)) {
    for (const row of rows) if (row.id) done.add(row.id);
  }
  let queue: ReturnType<typeof parseQueueSnapshot> = [];
  try {
    queue = parseQueueSnapshot(store.getItem(queueStorageKey(sessionId)));
  } catch {
    // File illisible : on compte ce qui est confirmé.
  }
  for (const set of restoredSets(queue)) done.add(set.id);
  for (const id of restoredDeletedIds(queue)) done.delete(id);
  return { sessionId, dayName, startedAt, setCount: done.size };
}

// ---------------------------------------------------------------------------
// Dernier compte connu
// ---------------------------------------------------------------------------

export function rememberProfileId(store: KeyValueStore, profileId: string): void {
  try {
    if (store.getItem(LAST_PROFILE_KEY) !== profileId) store.setItem(LAST_PROFILE_KEY, profileId);
  } catch {
    // Rien de grave : hors ligne, l'écran proposera « Réessayer ».
  }
}

export function lastKnownProfileId(store: KeyValueStore): string | null {
  try {
    return store.getItem(LAST_PROFILE_KEY);
  } catch {
    return null;
  }
}
