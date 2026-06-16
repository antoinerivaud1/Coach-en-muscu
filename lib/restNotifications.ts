// Notifications de fin de repos (CM-28) — approche 100% client via le SW.
// Le service worker planifie une notification locale ; aucun backend push.

export function isNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

/** Demande la permission notifications si elle n'a pas encore été décidée. */
export function ensureNotificationPermission(): void {
  if (!isNotificationSupported()) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}

/** Planifie une notification à l'échéance du repos (secondes). */
export async function scheduleRestNotification(
  seconds: number,
  url: string,
): Promise<void> {
  if (!isNotificationSupported() || Notification.permission !== "granted") return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({
      type: "schedule-rest",
      ms: Math.max(0, seconds) * 1000,
      url,
    });
  } catch {
    // SW indisponible : on ignore silencieusement.
  }
}

/** Annule une notification de repos en attente (repos passé/annulé). */
export async function cancelRestNotification(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "cancel-rest" });
  } catch {
    // ignore
  }
}
