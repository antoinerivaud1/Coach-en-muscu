// Notifications de fin de repos.
// - Natif (Capacitor) : @capacitor/local-notifications, fiable sur écran verrouillé.
// - Web (PWA navigateur) : planification côté service worker (CM-28).
//
// Source unique de vérité : l'échéance absolue du timer (`endsAt`, CM-73).
// Toute planification passe par `scheduleRestEnd`, qui annule d'abord ce qui
// est en attente : une modification d'échéance (+15 s / -15 s) replanifie donc
// une notification unique, à la bonne heure (CM-74).
import { Capacitor } from "@capacitor/core";

/**
 * Id unique et constant de la notification de repos. Constant pour que
 * l'annulation vise toujours la notification réellement en attente, quel que
 * soit le nombre de replanifications.
 */
export const REST_NOTIF_ID = 1001;

/**
 * Délai restant avant l'échéance, borné à 0. Un délai nul (échéance passée,
 * valeur non finie) signifie : ne rien planifier. Logique pure, testée.
 */
export function restDelayMs(endsAt: number, now: number): number {
  const delay = endsAt - now;
  return Number.isFinite(delay) && delay > 0 ? delay : 0;
}

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

/**
 * File d'exécution : les appels sont asynchrones (import dynamique du plugin,
 * `serviceWorker.ready`), donc deux appuis rapprochés sur « + 15 s »
 * pourraient s'entrelacer et laisser en place l'ancienne échéance. On les
 * sérialise, et une demande dépassée par une plus récente est abandonnée.
 */
let queue: Promise<void> = Promise.resolve();
let lastRequestId = 0;

function enqueue(task: (requestId: number) => Promise<void>): Promise<void> {
  const requestId = ++lastRequestId;
  queue = queue.then(() => task(requestId)).catch(() => {});
  return queue;
}

function isCurrent(requestId: number): boolean {
  return requestId === lastRequestId;
}

async function cancelNow(): Promise<void> {
  if (isNative()) {
    try {
      const { LocalNotifications } = await import("@capacitor/local-notifications");
      await LocalNotifications.cancel({
        notifications: [{ id: REST_NOTIF_ID }],
      });
    } catch {
      // plugin indisponible : on ignore.
    }
    return;
  }
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: "cancel-rest" });
  } catch {
    // SW indisponible : on ignore silencieusement.
  }
}

/**
 * Planifie la notification sur l'échéance absolue du repos. Idempotente :
 * annule toujours d'abord la notification en attente, puis en planifie une
 * seule. La permission n'est jamais redemandée ici.
 */
export async function scheduleRestEnd(
  endsAt: number,
  url?: string,
): Promise<void> {
  return enqueue(async (requestId) => {
    await cancelNow();
    if (!isCurrent(requestId)) return;
    // Le délai est recalculé au dernier moment : l'annulation a pu prendre
    // quelques millisecondes.
    if (restDelayMs(endsAt, Date.now()) <= 0) return;

    if (isNative()) {
      try {
        const { LocalNotifications } = await import(
          "@capacitor/local-notifications"
        );
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display !== "granted") return;
        if (!isCurrent(requestId)) return;
        await LocalNotifications.schedule({
          notifications: [
            {
              id: REST_NOTIF_ID,
              title: "Repos terminé",
              body: "C'est reparti, prochaine série !",
              schedule: { at: new Date(endsAt) },
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
      if (!isCurrent(requestId)) return;
      // On envoie l'échéance absolue : le SW en déduit son délai à la
      // réception, sans dépendre de la latence du message.
      reg.active?.postMessage({
        type: "schedule-rest",
        endsAt,
        url,
      });
    } catch {
      // SW indisponible : on ignore silencieusement.
    }
  });
}

/** Annule la notification de repos en attente (repos passé, annulé, terminé). */
export async function cancelRestEnd(): Promise<void> {
  // Une demande plus récente annule celle-ci d'office : la sérialisation
  // suffit, l'annulation n'a rien à replanifier ensuite.
  return enqueue(() => cancelNow());
}
