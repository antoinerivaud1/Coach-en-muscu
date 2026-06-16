// Service worker minimal: network-first pour rester à jour, fallback cache offline.
const CACHE = "coach-muscu-v2";
const SHELL = ["/dashboard", "/progress", "/history"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL).catch(() => {})),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Ne pas mettre en cache les appels API/auth Supabase.
  if (url.pathname.startsWith("/auth")) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        if (req.mode === "navigate" && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then((cached) => cached || caches.match("/dashboard")),
      ),
  );
});

// --- Timer de repos : notification locale planifiée (CM-28) ---
// Approche 100% client : l'app poste un message au SW au lancement du repos,
// le SW programme une notification via setTimeout (sans backend push en V1).
let restTimerId = null;

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "schedule-rest") {
    if (restTimerId) clearTimeout(restTimerId);
    const delay = Math.max(0, Number(data.ms) || 0);
    restTimerId = setTimeout(() => {
      restTimerId = null;
      self.registration.showNotification("Repos terminé 💪", {
        body: "Reprends ta série !",
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: "rest-timer",
        renotify: true,
        vibrate: [300, 100, 300],
        data: { url: data.url || "/dashboard" },
      });
    }, delay);
  } else if (data.type === "cancel-rest") {
    if (restTimerId) {
      clearTimeout(restTimerId);
      restTimerId = null;
    }
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ("focus" in client) return client.focus();
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
        return undefined;
      }),
  );
});
