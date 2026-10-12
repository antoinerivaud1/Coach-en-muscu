// CM-89 (PR 3) : règles pures de la cible native (scripts/lib/native-rules.mjs).
// Lanceur intégré de Node, aucune dépendance : `npm run test:scripts`.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_PAGES,
  bundleProblems,
  placeholderAction,
  resolveNativeFile,
} from "../lib/native-rules.mjs";

test("placeholder : copié seulement avec server.url et sans index.html", () => {
  assert.equal(placeholderAction({ hasServerUrl: true, index: "missing" }), "copy");
  assert.equal(placeholderAction({ hasServerUrl: true, index: "placeholder" }), "keep");
  assert.equal(placeholderAction({ hasServerUrl: true, index: "app" }), "keep");
});

test("placeholder : sans server.url, échec si l'app n'est pas là", () => {
  assert.equal(placeholderAction({ hasServerUrl: false, index: "placeholder" }), "fail");
  assert.equal(placeholderAction({ hasServerUrl: false, index: "missing" }), "fail");
  assert.equal(placeholderAction({ hasServerUrl: false, index: "app" }), "keep");
});

const EXPORT = new Set([
  "index.html",
  "dashboard.html",
  "duo/rejoindre.html",
  "duo/rejoindre/confirmer.html",
  "guide/index.html",
  "dashboard.txt",
  "_next/static/chunks/main.js",
]);
const isFile = (path) => EXPORT.has(path);

test("routeur : sans extension, <chemin>.html puis <chemin>/index.html puis la racine", () => {
  assert.deepEqual(resolveNativeFile("/", isFile), { file: "index.html", fallback: false });
  assert.deepEqual(resolveNativeFile("/dashboard", isFile), { file: "dashboard.html", fallback: false });
  assert.deepEqual(resolveNativeFile("/dashboard/", isFile), { file: "dashboard.html", fallback: false });
  assert.deepEqual(resolveNativeFile("/duo/rejoindre", isFile), { file: "duo/rejoindre.html", fallback: false });
  assert.deepEqual(resolveNativeFile("/duo/rejoindre/confirmer", isFile), {
    file: "duo/rejoindre/confirmer.html",
    fallback: false,
  });
  assert.deepEqual(resolveNativeFile("/guide", isFile), { file: "guide/index.html", fallback: false });
  assert.deepEqual(resolveNativeFile("/inconnu", isFile), { file: "index.html", fallback: true });
});

test("routeur : avec extension, le fichier tel quel ou 404 ; jamais `..`", () => {
  assert.deepEqual(resolveNativeFile("/dashboard.txt", isFile), { file: "dashboard.txt", fallback: false });
  assert.deepEqual(resolveNativeFile("/_next/static/chunks/main.js", isFile), {
    file: "_next/static/chunks/main.js",
    fallback: false,
  });
  assert.equal(resolveNativeFile("/_next/static/absent.js", isFile), null);
  assert.equal(resolveNativeFile("/../package.json", isFile), null);
});

function completeExport() {
  const files = [];
  for (const page of REQUIRED_PAGES) {
    files.push(page);
    if (page.endsWith(".html")) files.push(page.replace(/\.html$/, ".txt"));
  }
  return files;
}

test("export : complet, aucun problème", () => {
  assert.deepEqual(bundleProblems([...completeExport(), "404.html"], () => ""), []);
});

test("export : pages manquantes, web seulement, source maps, RSC, vercel.app", () => {
  const files = [
    ...completeExport().filter((file) => file !== "login.html" && file !== "history.txt"),
    "sentry-test.html",
    "sentry-test.txt",
    "_next/static/chunks/main.js",
    "_next/static/chunks/main.js.map",
  ];
  const problems = bundleProblems(files, (file) =>
    file === "_next/static/chunks/main.js" ? 'fetch("https://x.vercel.app")' : "",
  );
  assert.deepEqual(problems.sort(), [
    "charge RSC manquante : history.txt",
    "fichier web seulement : sentry-test.html",
    "fichier web seulement : sentry-test.txt",
    "page manquante : login.html",
    "référence à vercel.app : _next/static/chunks/main.js",
    "source map : _next/static/chunks/main.js.map",
  ]);
});
