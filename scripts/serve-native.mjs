#!/usr/bin/env node
// CM-89 (PR 3) : petit serveur statique pour `capacitor/www` (tests e2e
// `native`, CI). Il imite le routeur iOS PRÉVU en PR 4 (Swift, dans
// ios/App), pour attraper dès la CI une page absente de l'export ou une
// adresse mal résolue. Règles : `resolveNativeFile`
// (scripts/lib/native-rules.mjs), à reproduire EXACTEMENT en Swift.
//
// Il ne masque aucun appel serveur : GET et HEAD seulement (405 sinon,
// comme une coque sans serveur), et en-têtes pour les tests :
// - `X-Native-File` : fichier servi ;
// - `X-Native-Fallback: 1` : adresse inconnue servie par `index.html`.
//
// Usage : node scripts/serve-native.mjs [--port 4300] [--dir capacitor/www]
// Node pur (modules intégrés), aucune dépendance.

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { resolveNativeFile } from "./lib/native-rules.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    port: { type: "string", default: process.env.PORT ?? "4300" },
    dir: { type: "string", default: join(ROOT, "capacitor", "www") },
  },
});
const WEB_DIR = resolve(values.dir);
const PORT = Number(values.port);

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Fichier régulier DANS WEB_DIR (garde-fou contre toute sortie du dossier). */
function isFile(relativePath) {
  const full = resolve(WEB_DIR, relativePath);
  if (!full.startsWith(WEB_DIR + sep)) return false;
  try {
    return statSync(full).isFile();
  } catch {
    return false;
  }
}

if (!existsSync(join(WEB_DIR, "index.html"))) {
  console.error(`[serve-native] ${WEB_DIR}/index.html introuvable : lancer \`npm run build:native\`.`);
  process.exit(1);
}

const server = createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" }).end("405");
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const resolved = resolveNativeFile(pathname, isFile);
  if (!resolved || !isFile(resolved.file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404");
    return;
  }
  const full = resolve(WEB_DIR, resolved.file);
  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(full).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Native-File": resolved.file,
    ...(resolved.fallback ? { "X-Native-Fallback": "1" } : {}),
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(full).pipe(res);
});

server.listen(PORT, () => {
  console.log(`[serve-native] ${WEB_DIR} sur http://localhost:${PORT}`);
});
