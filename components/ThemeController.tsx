"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import {
  APPEARANCE_EVENT,
  APPEARANCE_KEY,
  THEME_BACKGROUND,
  parseAppearance,
  resolveTheme,
  type Theme,
} from "@/lib/appearance";
import { SESSION_VIEW_PATH } from "@/lib/routes";

/**
 * CM-116 : tient le thème à jour après le premier rendu (le script de <head>
 * l'a déjà posé). Recalcule quand le réglage change, quand l'appareil bascule
 * clair/sombre, à chaque minute (mode « Selon l'heure ») et au retour dans
 * l'app.
 *
 * Pendant une séance (`/sessions/view`), le thème ne bouge pas : il est figé
 * à l'ouverture de l'écran, pour ne jamais changer entre deux séries.
 *
 * Dans l'app iPhone, la barre d'état suit le thème (texte clair sur sombre,
 * foncé sur clair).
 */
function readTheme(): Theme {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(APPEARANCE_KEY);
  } catch {
    // Stockage bloqué : réglage par défaut.
  }
  const systemDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  return resolveTheme(parseAppearance(raw), new Date(), systemDark);
}

async function syncStatusBar(theme: Theme) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    // Style.Dark = texte clair (pour un fond sombre).
    await StatusBar.setStyle({ style: theme === "dark" ? Style.Dark : Style.Light });
  } catch {
    // Plugin absent ou indisponible : sans conséquence.
  }
}

export function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (el.getAttribute("data-theme") !== theme) el.setAttribute("data-theme", theme);
  document
    .querySelectorAll('meta[name="theme-color"]')
    .forEach((m) => m.setAttribute("content", THEME_BACKGROUND[theme]));
  void syncStatusBar(theme);
}

export default function ThemeController() {
  const pathname = usePathname();
  const frozen = pathname?.startsWith(SESSION_VIEW_PATH) ?? false;

  useEffect(() => {
    if (frozen) return;
    const update = () => applyTheme(readTheme());
    update();

    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    const onStorage = (e: StorageEvent) => {
      if (e.key === APPEARANCE_KEY) update();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") update();
    };
    mq?.addEventListener?.("change", update);
    window.addEventListener("storage", onStorage);
    window.addEventListener(APPEARANCE_EVENT, update);
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(update, 60_000);
    return () => {
      mq?.removeEventListener?.("change", update);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APPEARANCE_EVENT, update);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [frozen]);

  return null;
}
