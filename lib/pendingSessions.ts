import type { FinishSessionInput } from "@/app/sessions/[id]/actions";

const KEY = "cm_pending_sessions";

export function getPending(): FinishSessionInput[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FinishSessionInput[]) : [];
  } catch {
    return [];
  }
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
