// CM-60 : remise du fichier d'export au téléphone. Un simple <a download>
// vers un ZIP ne fait rien de fiable en PWA iOS (mode « écran d'accueil ») ni
// dans un WKWebView (coque Capacitor) : on télécharge le fichier nous-mêmes,
// puis on ouvre la feuille de partage du système (« Enregistrer dans
// Fichiers », AirDrop, Mail…) quand elle accepte les fichiers, sinon on
// déclenche un téléchargement classique depuis un lien temporaire.
// Dépendances injectées : testé avec des doublures dans
// tests/unit/accountExport.spec.ts.

import { exportFileBaseName } from "./accountExport";

export const EXPORT_URL = "/profile/export";

export type ExportDeps = {
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  navigator: {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  /** Clique un lien temporaire `href` + `download` (téléchargement). */
  clickDownloadLink: (href: string, fileName: string) => void;
  now?: () => Date;
};

/** `shared` : feuille de partage ; `downloaded` : téléchargement ; `cancelled` : partage annulé. */
export type ExportOutcome = "shared" | "downloaded" | "cancelled";

export class ExportError extends Error {}

/** Nom du fichier : celui de Content-Disposition, sinon celui du jour. */
export function exportFileName(contentDisposition: string | null, now: Date): string {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition ?? "");
  const name = m?.[1] ? decodeURIComponent(m[1].trim()) : "";
  return /^[\w.-]+\.zip$/.test(name) ? name : `${exportFileBaseName(now)}.zip`;
}

function isAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
}

export async function deliverExport(deps: ExportDeps): Promise<ExportOutcome> {
  let res: Response;
  try {
    res = await deps.fetch(EXPORT_URL, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/zip" },
    });
  } catch {
    throw new ExportError("network");
  }
  // Échec côté serveur : redirection vers le Profil ou la connexion (HTML).
  if (!res.ok || !(res.headers.get("Content-Type") ?? "").includes("application/zip")) {
    throw new ExportError(`http ${res.status}`);
  }
  const blob = await res.blob();
  if (blob.size === 0) throw new ExportError("empty");
  const name = exportFileName(res.headers.get("Content-Disposition"), deps.now?.() ?? new Date());
  const file = new File([blob], name, { type: "application/zip" });

  const nav = deps.navigator;
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return "shared";
    } catch (e) {
      // Feuille fermée par l'utilisateur : rien à faire. Toute autre erreur
      // (geste utilisateur expiré, partage refusé) : téléchargement.
      if (isAbort(e)) return "cancelled";
    }
  }

  const url = deps.createObjectURL(file);
  try {
    deps.clickDownloadLink(url, name);
  } finally {
    // Laisse au navigateur le temps de lire le blob avant de le libérer.
    const timer: unknown = setTimeout(() => deps.revokeObjectURL(url), 60_000);
    (timer as { unref?: () => void }).unref?.();
  }
  return "downloaded";
}
