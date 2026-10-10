import type { FinishSessionInput } from "@/app/sessions/[id]/actions";

/** Clôtures de séance faites hors ligne, rejouées par `PendingSync`. */
export const PENDING_SESSIONS_KEY = "cm_pending_sessions";

/**
 * CM-59 B : clôtures refusées définitivement par le serveur (séance
 * introuvable ou pas à toi). Mises de côté au lieu d'être jetées en silence.
 */
export const REFUSED_SESSIONS_KEY = "cm_refused_sessions";

const KEY = PENDING_SESSIONS_KEY;

function read(key: string): FinishSessionInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as FinishSessionInput[]) : [];
  } catch {
    return [];
  }
}

export function getPending(): FinishSessionInput[] {
  return read(KEY);
}

export function setPending(items: FinishSessionInput[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
}

export function addPending(item: FinishSessionInput): void {
  const items = getPending();
  items.push(item);
  setPending(items);
}

export function getRefusedSessions(): FinishSessionInput[] {
  return read(REFUSED_SESSIONS_KEY);
}

export function addRefusedSessions(items: FinishSessionInput[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  try {
    window.localStorage.setItem(
      REFUSED_SESSIONS_KEY,
      JSON.stringify([...getRefusedSessions(), ...items]),
    );
  } catch {
    // Stockage indisponible : rien de plus à faire.
  }
}
