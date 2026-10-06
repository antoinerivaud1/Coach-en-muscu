import { parseAuthMode, type AuthMode } from "./core";

/**
 * CM-58 : palier d'auth courant, lu dans l'environnement serveur (Vercel).
 * Jamais préfixé `NEXT_PUBLIC_`, jamais lu depuis un cookie ni la requête.
 * Changer `AUTH_MODE` sur Vercel demande un redéploiement.
 */
export function getAuthMode(): AuthMode {
  return parseAuthMode(process.env.AUTH_MODE);
}
