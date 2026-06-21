// Notifications de fin de repos.
// - Natif (Capacitor) : @capacitor/local-notifications, fiable sur écran verrouillé.
// - Web (PWA navigateur) : planification côté service worker (CM-28).
import { Capacitor } from "@capacitor/core";

const REST_NOTIF_ID = 1001;

function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function isNotificationSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator
  );
}

/** Demande la permission notifications si elle n'a pas encore été décidée. */
export function ensureNotificationPermission(): void {
  if (isNative()) {
    import("@capacitor/local-notifications")
      .then(({ LocalNotifications }) =>
        LocalNotifications.requestPermissions().catch(() => {}),
      )
      .catch(() => {});
    return;
  }
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
  if (isNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== "granted") {
        const req = await LocalNotifications.requestPermissions();
        if (req.display !== "granted") return;
      }
      await LocalNotifications.schedule({
        notifications: [
          {
            id: REST_NOTIF_ID,
            title: "Repos terminé",
            body: "C'est reparti, prochaine série !",
            schedule: { at: new Date(Date.now() + Math.max(0, seconds) * 1000) },
          },
        ],
      });
    } catch {
      // plugin indisponible : on ignore.
    }
    return;
  }

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
  if (isNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.cancel({
        notifications: [{ id: REST_NOTIF_ID }],
      });
    } catch {
      // ignore
    }
    return;
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "cancel-rest" });
  } catch {
    // ignore
  }
}
