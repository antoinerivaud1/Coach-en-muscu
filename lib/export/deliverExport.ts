// CM-60 : remise du fichier d'export au téléphone. Un simple <a download>
// vers un ZIP ne fait rien de fiable en PWA iOS (mode « écran d'accueil ») ni
// dans un WKWebView (coque Capacitor) : on prépare le fichier nous-mêmes,
// puis on ouvre la feuille de partage du système (« Enregistrer dans
// Fichiers », AirDrop, Mail…) quand elle accepte les fichiers, sinon on
// déclenche un téléchargement classique depuis un lien temporaire.
// CM-88 : l'archive est construite DANS LE NAVIGATEUR (lecture sous RLS, puis
// `buildExportZip`, lib/data/accountExport.ts) : plus de route serveur.
// Dépendances injectées : testé avec des doublures dans
// tests/unit/accountExport.spec.ts.

import { exportFileBaseName } from "./accountExport";

export type ExportDeps = {
  /** Lit les données du compte et renvoie l'archive ZIP, datée de `now`. */
  buildZip: (now: Date) => Promise<Uint8Array<ArrayBuffer>>;
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

/** Nom du fichier : coach-en-muscu-export-AAAA-MM-JJ.zip (date de Paris). */
export function exportFileName(now: Date): string {
  return `${exportFileBaseName(now)}.zip`;
}

function isAbort(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: string }).name === "AbortError";
}

export async function deliverExport(deps: ExportDeps): Promise<ExportOutcome> {
  const now = deps.now?.() ?? new Date();
  let zip: Uint8Array<ArrayBuffer>;
  try {
    zip = await deps.buildZip(now);
  } catch (e) {
    throw new ExportError(e instanceof Error ? e.message : "lecture");
  }
  if (zip.byteLength === 0) throw new ExportError("empty");
  const name = exportFileName(now);
  const file = new File([zip], name, { type: "application/zip" });

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
