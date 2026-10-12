#!/usr/bin/env node
// CM-89 (PR 3) : petit serveur statique pour `capacitor/www` (tests e2e
// `native`, CI). Il imite le routeur iOS PRÉVU en PR 4 (Swift, dans
// ios/App), pour attraper dès la CI une page absente de l'export ou une
// adresse mal résolue :
//
// - chemin AVEC extension (`/_next/…js`, `/dashboard.txt`, `/icons/x.png`) :
//   le fichier tel quel, 404 s'il manque ;
// - chemin SANS extension : `<chemin>.html` s'il existe, sinon
//   `<chemin>/index.html` s'il existe, sinon `/index.html` (racine) ;
// - la query (`?id=`) est ignorée pour choisir le fichier.
//
// Le routeur Swift doit suivre EXACTEMENT ces règles (voir NATIVE.md).
// En-tête `X-Native-File` : fichier servi (pour les tests).
//
// Usage : node scripts/serve-native.mjs [--port 4300] [--dir capacitor/www]
// Node pur (modules intégrés), aucune dépendance.

import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

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
  ".map": "application/json; charset=utf-8",
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

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Fichier à servir pour ce chemin (relatif à WEB_DIR), ou null (404). */
function resolveNativePath(pathname) {
  const clean = normalize(pathname).replace(/^([/\\])+/, "").replace(/[/\\]+$/, "");
  if (clean.split(/[/\\]/).includes("..")) return null;
  if (clean === "") return "index.html";
  if (extname(clean) !== "") return isFile(join(WEB_DIR, clean)) ? clean : null;
  for (const candidate of [`${clean}.html`, join(clean, "index.html")]) {
    if (isFile(join(WEB_DIR, candidate))) return candidate;
  }
  return "index.html";
}

if (!existsSync(join(WEB_DIR, "index.html"))) {
  console.error(`[serve-native] ${WEB_DIR}/index.html introuvable : lancer \`npm run build:native\`.`);
  process.exit(1);
}

const server = createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = resolveNativePath(pathname);
  const full = file ? resolve(WEB_DIR, file) : null;
  // Garde-fou : jamais un fichier hors de WEB_DIR.
  if (!file || !full || (full !== WEB_DIR && !full.startsWith(WEB_DIR + sep))) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404");
    return;
  }
  res.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(full).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Native-File": relative(WEB_DIR, full).split(sep).join("/"),
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
