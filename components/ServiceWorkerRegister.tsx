"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

/** CM-89 (PR 1) : app native (Capacitor) ? En cas de doute, non (web). */
function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // CM-89 (PR 1) : pas de service worker dans l'app native. Le bundle est
    // déjà embarqué (rien à mettre en cache) et les notifications de repos
    // passent par @capacitor/local-notifications (lib/restNotifications.ts).
    if (isNative()) return;
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);
  return null;
}
