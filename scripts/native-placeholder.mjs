#!/usr/bin/env node
// CM-89 (PR 3) : hook Capacitor `capacitor:copy:before` (package.json), lancé
// par `npx cap copy` / `npx cap sync` juste avant la copie de `capacitor/www`
// vers `ios/App/App/public`.
//
// `capacitor/www` est maintenant GÉNÉRÉ (`npm run build:native`) et ignoré
// par git. Sur un clone neuf il n'existe pas ; or le projet Xcode référence
// le dossier `public` : sans lui, le build iOS échoue. Tant que
// `capacitor.config.ts` a un `server.url` (jusqu'à la PR 4), on y copie donc
// le placeholder versionné (`capacitor/placeholder/index.html`), jamais
// affiché puisque l'app charge le site.
//
// Sans `server.url` (après la PR 4), on ne copie RIEN : livrer un placeholder
// à la place de l'app serait pire qu'une erreur. Capacitor refuse alors
// lui-même un `capacitor/www` sans index.html (avant ce hook) ; un placeholder
// resté d'une synchro précédente est signalé ici.
//
// Un hook Capacitor ne peut pas interrompre la synchro (code de sortie
// ignoré) : d'où l'avertissement très visible.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB_DIR = process.env.CAPACITOR_WEB_DIR || join(ROOT, "capacitor", "www");
const PLACEHOLDER = join(ROOT, "capacitor", "placeholder", "index.html");
const MARKER = 'name="cm-native-placeholder"';

function hasServerUrl() {
  try {
    return Boolean(JSON.parse(process.env.CAPACITOR_CONFIG ?? "{}")?.server?.url);
  } catch {
    return false;
  }
}

const index = join(WEB_DIR, "index.html");
const isPlaceholder = existsSync(index) && readFileSync(index, "utf8").includes(MARKER);

if (hasServerUrl()) {
  if (!existsSync(index)) {
    mkdirSync(WEB_DIR, { recursive: true });
    copyFileSync(PLACEHOLDER, index);
    console.log("[native-placeholder] capacitor/www absent : placeholder copié (server.url actif).");
  }
} else if (isPlaceholder) {
  console.error(
    "\n[native-placeholder] ATTENTION : capacitor/www contient le PLACEHOLDER, pas l'app.\n" +
      "Lancer `npm run build:native` puis relancer `npx cap sync`.\n",
  );
}
