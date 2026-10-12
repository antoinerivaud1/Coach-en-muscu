#!/usr/bin/env node
// CM-89 (PR 3) : hook Capacitor `capacitor:copy:before` (package.json), lancé
// par `npx cap copy` / `npx cap sync` juste avant la copie de `capacitor/www`
// vers `ios/App/App/public`. Décision : `placeholderAction`
// (scripts/lib/native-rules.mjs).
//
// `capacitor/www` est GÉNÉRÉ (`npm run build:native`) et ignoré par git. Sur
// un clone neuf il n'existe pas ; or le projet Xcode référence le dossier
// `public` : sans lui, le build iOS échoue. Tant que `capacitor.config.ts` a
// un `server.url` (jusqu'à la PR 4), on y copie donc le placeholder versionné
// (`capacitor/placeholder/index.html`), jamais affiché puisque l'app charge
// le site.
//
// Sans `server.url` (après la PR 4), un placeholder ne doit JAMAIS partir
// dans l'app : erreur et code de sortie 1. Capacitor ignore le code de
// sortie des hooks (et `cap sync` continue après un échec de copie) : on
// supprime donc aussi `capacitor/www` (rien d'autre). Capacitor vide alors
// `ios/App/App/public` puis échoue à copier un dossier absent : le build
// Xcode échoue au lieu de livrer une app vide.

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLACEHOLDER_MARKER, placeholderAction } from "./lib/native-rules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_WEB_DIR = join(ROOT, "capacitor", "www");
const WEB_DIR = resolve(process.env.CAPACITOR_WEB_DIR || DEFAULT_WEB_DIR);
const PLACEHOLDER = join(ROOT, "capacitor", "placeholder", "index.html");

function hasServerUrl() {
  try {
    return Boolean(JSON.parse(process.env.CAPACITOR_CONFIG ?? "{}")?.server?.url);
  } catch {
    return false;
  }
}

function indexState() {
  const index = join(WEB_DIR, "index.html");
  if (!existsSync(index)) return "missing";
  return readFileSync(index, "utf8").includes(PLACEHOLDER_MARKER) ? "placeholder" : "app";
}

const action = placeholderAction({ hasServerUrl: hasServerUrl(), index: indexState() });

if (action === "copy") {
  mkdirSync(WEB_DIR, { recursive: true });
  copyFileSync(PLACEHOLDER, join(WEB_DIR, "index.html"));
  console.log("[native-placeholder] capacitor/www absent : placeholder copié (server.url actif).");
} else if (action === "fail") {
  console.error(
    "\n[native-placeholder] ERREUR : pas de server.url et capacitor/www ne contient pas l'app " +
      "(absent ou placeholder seul).\nLance d'abord `npm run build:native`, puis `npx cap sync`.\n",
  );
  // Seulement le webDir attendu : jamais un autre dossier, même configuré.
  if (WEB_DIR === DEFAULT_WEB_DIR) rmSync(WEB_DIR, { recursive: true, force: true });
  process.exit(1);
}
