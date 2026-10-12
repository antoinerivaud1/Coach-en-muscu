#!/usr/bin/env node
// CM-89 (PR 3) : build de la cible native (`npm run build:native`).
//
// 1. `next build` avec BUILD_TARGET=native : next.config.mjs passe en
//    `output: "export"` et ignore les fichiers `.web` (middleware,
//    /sentry-test). Rien n'est déplacé sur le disque : un build interrompu
//    (échec, Ctrl-C) ne laisse aucun fichier à restaurer.
// 2. L'export (`out/`) REMPLACE le contenu de `capacitor/www` (webDir de
//    Capacitor, ignoré par git).
// 3. Vérifie que les pages attendues par le routeur iOS existent.
//
// Attention : `next build` réécrit `.next`. Après ce script, relancer
// `npm run build` avant un `npm start` web.
//
// Node pur (modules intégrés), aucune dépendance en plus.

import { spawn } from "node:child_process";
import { existsSync, readdirSync, renameSync, rmSync, cpSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "out");
const WEB_DIR = join(ROOT, "capacitor", "www");

// Pages qui DOIVENT exister dans le bundle (adresses sans extension servies
// par le routeur iOS de la PR 4 : `/dashboard` -> `dashboard.html`).
const REQUIRED_FILES = [
  "index.html",
  "login.html",
  "dashboard.html",
  "history.html",
  "sessions/view.html",
  "seances/edit.html",
  "compte-supprime.html",
  "manifest.webmanifest",
];
// Pages web seulement : jamais dans le bundle.
const FORBIDDEN_FILES = ["sentry-test.html", "sentry-test/index.html"];

function fail(message) {
  console.error(`\n[build:native] ${message}`);
  process.exit(1);
}

function runNextBuild() {
  const require = createRequire(import.meta.url);
  const nextBin = require.resolve("next/dist/bin/next", { paths: [ROOT] });
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [nextBin, "build"], {
      cwd: ROOT,
      stdio: "inherit",
      env: { ...process.env, BUILD_TARGET: "native" },
    });
    // Ctrl-C : le terminal envoie déjà le signal à tout le groupe (donc à
    // `next build`) ; on attend sa fin pour sortir avec son code.
    const forward = (signal) => {
      if (child.exitCode === null) child.kill(signal);
    };
    process.on("SIGINT", forward);
    process.on("SIGTERM", forward);
    child.on("exit", (code, signal) => {
      process.off("SIGINT", forward);
      process.off("SIGTERM", forward);
      resolvePromise(signal ? 1 : (code ?? 1));
    });
  });
}

function listFiles(dir, base = dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(full, base));
    else files.push(relative(base, full));
  }
  return files;
}

rmSync(OUT_DIR, { recursive: true, force: true });

const code = await runNextBuild();
if (code !== 0) fail(`next build a échoué (code ${code}). capacitor/www n'a pas été modifié.`);
if (!existsSync(join(OUT_DIR, "index.html"))) fail("export introuvable : out/index.html manque.");

// Remplace capacitor/www en entier (aucun fichier d'un build précédent ne
// traîne). `rename` est atomique sur le même disque ; copie sinon.
rmSync(WEB_DIR, { recursive: true, force: true });
try {
  renameSync(OUT_DIR, WEB_DIR);
} catch {
  cpSync(OUT_DIR, WEB_DIR, { recursive: true });
  rmSync(OUT_DIR, { recursive: true, force: true });
}

const missing = REQUIRED_FILES.filter((file) => !existsSync(join(WEB_DIR, file)));
if (missing.length) fail(`fichiers manquants dans capacitor/www : ${missing.join(", ")}`);
const forbidden = FORBIDDEN_FILES.filter((file) => existsSync(join(WEB_DIR, file)));
if (forbidden.length) fail(`pages web seulement présentes dans le bundle : ${forbidden.join(", ")}`);

const html = listFiles(WEB_DIR)
  .filter((file) => file.endsWith(".html"))
  .sort();
const sizeMb = listFiles(WEB_DIR).reduce((sum, file) => sum + statSync(join(WEB_DIR, file)).size, 0) / 1e6;
console.log(`\n[build:native] capacitor/www prêt (${sizeMb.toFixed(1)} Mo), ${html.length} pages :`);
for (const file of html) console.log(`  ${file}`);
