// CM-89 (PR 3) : règles pures de la cible native, partagées par
// scripts/build-native.mjs, scripts/serve-native.mjs et
// scripts/native-placeholder.mjs. Aucun accès disque ici (testées par
// scripts/tests/native-rules.test.mjs, `npm run test:scripts`).

/** Repère du placeholder versionné (capacitor/placeholder/index.html). */
export const PLACEHOLDER_MARKER = 'name="cm-native-placeholder"';

/**
 * Hook `capacitor:copy:before` : que faire de `capacitor/www` ?
 * - `copy` : copier le placeholder (server.url actif, aucun index.html) ;
 * - `keep` : rien à faire ;
 * - `fail` : pas de server.url et pas d'app (dossier absent ou placeholder
 *   seul) : livrer ça donnerait une app vide, la synchro doit échouer.
 *
 * @param {{ hasServerUrl: boolean, index: "missing" | "placeholder" | "app" }} state
 * @returns {"copy" | "keep" | "fail"}
 */
export function placeholderAction({ hasServerUrl, index }) {
  if (hasServerUrl) return index === "missing" ? "copy" : "keep";
  return index === "app" ? "keep" : "fail";
}

function extensionOf(segment) {
  const dot = segment.lastIndexOf(".");
  return dot > 0 ? segment.slice(dot) : "";
}

/**
 * Routeur iOS PRÉVU en PR 4 (à reproduire en Swift) : fichier de
 * `capacitor/www` à servir pour un chemin (sans query), ou null (404).
 * - avec extension : le fichier tel quel, sinon 404 ;
 * - sans extension : `<chemin>.html`, sinon `<chemin>/index.html`, sinon
 *   `index.html` (`fallback: true`) ;
 * - `/` final ignoré ; `..` refusé.
 *
 * @param {string} pathname chemin décodé, ex. `/sessions/view`
 * @param {(relativePath: string) => boolean} isFile
 * @returns {{ file: string, fallback: boolean } | null}
 */
export function resolveNativeFile(pathname, isFile) {
  const segments = pathname.split(/[/\\]+/).filter(Boolean);
  if (segments.includes("..")) return null;
  const clean = segments.join("/");
  if (clean === "") return { file: "index.html", fallback: false };
  if (extensionOf(segments[segments.length - 1]) !== "") {
    return isFile(clean) ? { file: clean, fallback: false } : null;
  }
  for (const candidate of [`${clean}.html`, `${clean}/index.html`]) {
    if (isFile(candidate)) return { file: candidate, fallback: false };
  }
  return { file: "index.html", fallback: true };
}

/** Pages qui DOIVENT exister dans le bundle (adresses servies par le routeur iOS). */
export const REQUIRED_PAGES = [
  "index.html",
  "login.html",
  "dashboard.html",
  "history.html",
  "sessions/view.html",
  "seances/edit.html",
  "compte-supprime.html",
  "manifest.webmanifest",
];

/** Préfixes web seulement (page `.web`, tunnel Sentry, route handler) : jamais dans le bundle. */
export const FORBIDDEN_PREFIXES = ["sentry-test", "monitoring", "api/"];

const TEXT_EXTENSIONS = [".html", ".txt", ".js", ".css", ".json", ".webmanifest"];

/**
 * Problèmes d'un export natif, vides si le bundle peut remplacer
 * `capacitor/www`.
 *
 * @param {string[]} files chemins relatifs, séparés par `/`
 * @param {(file: string) => string} readText
 * @returns {string[]}
 */
export function bundleProblems(files, readText) {
  const problems = [];
  const set = new Set(files);
  for (const page of REQUIRED_PAGES) {
    if (!set.has(page)) problems.push(`page manquante : ${page}`);
  }
  for (const file of files) {
    if (FORBIDDEN_PREFIXES.some((prefix) => file.startsWith(prefix))) {
      problems.push(`fichier web seulement : ${file}`);
    }
    // Source maps : jamais livrées (code source lisible dans l'app).
    if (file.endsWith(".map")) problems.push(`source map : ${file}`);
    // Chaque page a sa charge utile RSC (`<page>.txt`), lue par les
    // navigations client ; sans elle, retour à la racine.
    if (file.endsWith(".html") && file !== "404.html") {
      const payload = `${file.slice(0, -".html".length)}.txt`;
      if (!set.has(payload)) problems.push(`charge RSC manquante : ${payload}`);
    }
    // Critère de fin de CM-89 : aucun domaine vercel.app dans la coque.
    if (TEXT_EXTENSIONS.includes(extensionOf(file.split("/").pop() ?? ""))) {
      if (readText(file).includes("vercel.app")) problems.push(`référence à vercel.app : ${file}`);
    }
  }
  return problems;
}
