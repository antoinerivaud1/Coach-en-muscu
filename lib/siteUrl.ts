// CM-89 (PR 4) : origine PUBLIQUE du site web, pour tout lien partagé hors de
// l'app (invitation duo, et plus tard liens de retour d'authentification).
// Dans l'app native, `window.location.origin` vaut `capacitor://localhost` :
// un tel lien ne s'ouvrirait chez personne. Logique pure dans
// `resolveSiteOrigin` (tests/unit/siteUrl.spec.ts).

import { Capacitor } from "@capacitor/core";
import siteOrigin from "./siteOrigin.json";

/**
 * Site web de production. Repli de l'app native quand `NEXT_PUBLIC_SITE_URL`
 * n'a pas été fournie au build. Rangé dans `siteOrigin.json` : le contrôle
 * de l'export natif (scripts/build-native.mjs) le lit aussi, pour tolérer
 * cette seule origine (texte d'un lien partagé, jamais appelée par l'app).
 */
export const PROD_WEB_ORIGIN: string = siteOrigin.prodWebOrigin;

/**
 * Origine `http(s)://hôte[:port]` d'une URL configurée, sans chemin ni « / »
 * final. Valeur vide, invalide ou d'un autre protocole : null (ignorée).
 */
export function normalizeOrigin(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * Ordre de choix :
 * 1. `configured` (`NEXT_PUBLIC_SITE_URL`) si elle est valide ;
 * 2. app native : `PROD_WEB_ORIGIN` (jamais `capacitor://localhost`) ;
 * 3. web : l'origine de la page (`currentOrigin`), comme avant CM-89 ;
 * 4. sans page (rendu serveur) : `PROD_WEB_ORIGIN`.
 */
export function resolveSiteOrigin(input: {
  configured?: string | null;
  native: boolean;
  currentOrigin?: string | null;
}): string {
  const configured = normalizeOrigin(input.configured);
  if (configured) return configured;
  if (input.native) return PROD_WEB_ORIGIN;
  return normalizeOrigin(input.currentOrigin) ?? PROD_WEB_ORIGIN;
}

function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Origine publique du site pour cet environnement (voir `resolveSiteOrigin`). */
export function publicSiteOrigin(): string {
  return resolveSiteOrigin({
    configured: process.env.NEXT_PUBLIC_SITE_URL,
    native: isNativeApp(),
    currentOrigin: typeof window === "undefined" ? null : window.location.origin,
  });
}
