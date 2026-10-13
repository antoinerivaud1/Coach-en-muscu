#!/usr/bin/env node
// CM-89 (PR 3) : build de la cible native (`npm run build:native`).
//
// 1. `next build` avec BUILD_TARGET=native : next.config.mjs passe en
//    `output: "export"` et ignore les fichiers `.web` (middleware,
//    /sentry-test). Rien n'est déplacé dans les sources : un build
//    interrompu (échec, Ctrl-C) ne laisse aucun fichier à restaurer.
// 2. Vérifie l'export (`out/`) AVANT de toucher à `capacitor/www` : pages
//    attendues par le routeur iOS, charges RSC, aucune page web seulement,
//    aucune source map, aucune référence à vercel.app hors origine des
//    liens partagés (`bundleProblems`, scripts/lib/native-rules.mjs ;
//    origine : lib/siteOrigin.json et NEXT_PUBLIC_SITE_URL).
// 3. Seulement si tout passe : remplace `capacitor/www` par échange de
//    dossiers (renommages), jamais à moitié remplacé ni vidé.
//
// Attention : `next build` réécrit `.next` (Next impose ce dossier pour un
// export). Après ce script, relancer `npm run build` avant un `npm start` web.
//
// Node pur (modules intégrés), aucune dépendance en plus.

import { spawn } from "node:child_process";
import { cpSync, existsSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { bundleProblems, missingNativeEnv } from "./lib/native-rules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "out");
const CAP_DIR = join(ROOT, "capacitor");
const WEB_DIR = join(CAP_DIR, "www");
// Dossiers de l'échange, à côté de www (même disque : renommages atomiques).
const NEXT_WEB_DIR = join(CAP_DIR, ".www-next");
const OLD_WEB_DIR = join(CAP_DIR, ".www-old");

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

function listFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(relative(dir, full).split(sep).join("/"));
    }
  };
  walk(dir);
  return files.sort();
}

/** Remplace `capacitor/www` par `source` sans jamais le laisser vide ou partiel. */
function swapWebDir(source) {
  rmSync(NEXT_WEB_DIR, { recursive: true, force: true });
  rmSync(OLD_WEB_DIR, { recursive: true, force: true });
  try {
    renameSync(source, NEXT_WEB_DIR);
  } catch {
    // Autre disque (EXDEV) : copie complète d'abord, www intact pendant ce temps.
    cpSync(source, NEXT_WEB_DIR, { recursive: true });
    rmSync(source, { recursive: true, force: true });
  }
  const hadWebDir = existsSync(WEB_DIR);
  if (hadWebDir) renameSync(WEB_DIR, OLD_WEB_DIR);
  try {
    renameSync(NEXT_WEB_DIR, WEB_DIR);
  } catch (error) {
    if (hadWebDir) renameSync(OLD_WEB_DIR, WEB_DIR);
    throw error;
  }
  rmSync(OLD_WEB_DIR, { recursive: true, force: true });
}

// CM-90 : sans variables Supabase, l'export passe mais l'app plante à
// l'ouverture (« Oups, l'app a planté »). Même chargement des fichiers `.env*`
// que `next build`, et refus net AVANT de construire.
{
  const require = createRequire(import.meta.url);
  const nextDir = dirname(require.resolve("next/package.json", { paths: [ROOT] }));
  const { loadEnvConfig } = require(require.resolve("@next/env", { paths: [nextDir] }));
  loadEnvConfig(ROOT, false, { info() {}, error: console.error });
  const missing = missingNativeEnv(process.env);
  if (missing.length) {
    fail(
      `réglages absents, rien n'a été construit :\n` +
        missing.map((problem) => `  - ${problem}`).join("\n") +
        `\nAjoute-les dans .env.local (voir NATIVE.md), puis relance.`,
    );
  }
}

rmSync(OUT_DIR, { recursive: true, force: true });

const code = await runNextBuild();
if (code !== 0) fail(`next build a échoué (code ${code}). capacitor/www n'a pas été modifié.`);
if (!existsSync(OUT_DIR)) fail("export introuvable : out/ manque. capacitor/www n'a pas été modifié.");

/** Origines des liens partagés (lib/siteUrl.ts) : seul vercel.app toléré. */
function sharedLinkOrigins() {
  const origins = [JSON.parse(readFileSync(join(ROOT, "lib/siteOrigin.json"), "utf8")).prodWebOrigin];
  try {
    if (process.env.NEXT_PUBLIC_SITE_URL) origins.push(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
  } catch {
    // URL invalide : ignorée par lib/siteUrl.ts, donc absente du bundle.
  }
  return origins;
}

const files = listFiles(OUT_DIR);
const problems = bundleProblems(files, (file) => readFileSync(join(OUT_DIR, file), "utf8"), {
  allowedOrigins: sharedLinkOrigins(),
});
if (problems.length) {
  fail(
    `export refusé, capacitor/www n'a pas été modifié (export laissé dans out/) :\n` +
      problems.map((problem) => `  - ${problem}`).join("\n"),
  );
}

const sizeMb = files.reduce((sum, file) => sum + statSync(join(OUT_DIR, file)).size, 0) / 1e6;
swapWebDir(OUT_DIR);

const html = files.filter((file) => file.endsWith(".html"));
console.log(`\n[build:native] capacitor/www prêt (${sizeMb.toFixed(1)} Mo), ${html.length} pages :`);
for (const file of html) console.log(`  ${file}`);
