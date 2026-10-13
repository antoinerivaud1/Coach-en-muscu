// CM-90 (PR 1) : démarrages de séance faits hors ligne.
//
// La séance reçoit son id sur le téléphone : ses séries peuvent être mises en
// file tout de suite, avec ce même id. Au retour du réseau, la séance est
// créée en base AVANT ses séries (lib/offline/outbox.ts). Utilisée par le
// démarrage hors ligne (PR 2) ; logique pure, stockage injecté.

import type { KeyValueStore } from "@/lib/offline/durableQueues";
import { PENDING_STARTS_KEY, REFUSED_STARTS_KEY } from "@/lib/offline/keys";

export type PendingStart = {
  sessionId: string;
  profileId: string;
  programDayId: string;
  /** ISO 8601 : heure réelle du démarrage sur le téléphone. */
  performedAt: string;
};

function parseStart(value: unknown): PendingStart | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const { sessionId, profileId, programDayId, performedAt } = raw;
  if (typeof sessionId !== "string" || sessionId === "") return null;
  if (typeof profileId !== "string" || profileId === "") return null;
  if (typeof programDayId !== "string" || programDayId === "") return null;
  if (typeof performedAt !== "string" || Number.isNaN(Date.parse(performedAt))) return null;
  return { sessionId, profileId, programDayId, performedAt };
}

/** Relecture défensive : une entrée illisible est ignorée, jamais fatale. */
export function parseStarts(raw: string | null): PendingStart[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseStart).filter((s): s is PendingStart => s !== null);
  } catch {
    return [];
  }
}

function write(store: KeyValueStore, key: string, items: PendingStart[]): void {
  try {
    if (items.length === 0) store.removeItem(key);
    else store.setItem(key, JSON.stringify(items));
  } catch {
    // Stockage indisponible : rien de mieux à faire ici.
  }
}

export function getPendingStarts(store: KeyValueStore): PendingStart[] {
  return parseStarts(store.getItem(PENDING_STARTS_KEY));
}

export function setPendingStarts(store: KeyValueStore, items: PendingStart[]): void {
  write(store, PENDING_STARTS_KEY, items);
}

/** Ajoute un démarrage ; un même `sessionId` n'est jamais mis deux fois. */
export function addPendingStart(store: KeyValueStore, start: PendingStart): void {
  const items = getPendingStarts(store);
  if (items.some((s) => s.sessionId === start.sessionId)) return;
  setPendingStarts(store, [...items, start]);
}

/**
 * Retire un démarrage pas encore envoyé (séance supprimée avant d'avoir été
 * créée en base). Rend vrai s'il y en avait un.
 */
export function removePendingStart(store: KeyValueStore, sessionId: string): boolean {
  const items = getPendingStarts(store);
  const kept = items.filter((s) => s.sessionId !== sessionId);
  if (kept.length === items.length) return false;
  setPendingStarts(store, kept);
  return true;
}

/** Vrai tant que la séance n'existe pas encore en base. */
export function hasPendingStart(store: KeyValueStore, sessionId: string): boolean {
  return getPendingStarts(store).some((s) => s.sessionId === sessionId);
}

export function getRefusedStarts(store: KeyValueStore): PendingStart[] {
  return parseStarts(store.getItem(REFUSED_STARTS_KEY));
}

export function addRefusedStarts(store: KeyValueStore, items: PendingStart[]): void {
  if (items.length === 0) return;
  write(store, REFUSED_STARTS_KEY, [...getRefusedStarts(store), ...items]);
}
