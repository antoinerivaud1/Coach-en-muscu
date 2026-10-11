import type { CookieOptionsWithName } from "@supabase/ssr";

// CM-58 : réglages partagés par le client d'auth serveur et le middleware.
// Aucun import de `next/headers` ici : ce fichier est chargé par le middleware.

/**
 * Options des cookies de session Supabase (`sb-<ref>-auth-token*`).
 * - CM-88 : PAS `httpOnly`. Les écrans client lisent la session pour
 *   interroger Supabase depuis le navigateur (sous RLS), comme le fera l'app
 *   native (CM-89). C'est le réglage par défaut de @supabase/ssr. Contrepartie :
 *   un script injecté (XSS) pourrait lire le jeton ; React échappe tout le
 *   contenu affiché et l'app n'insère aucun HTML brut venant des utilisateurs.
 * - `secure` en production (HTTPS sur Vercel) ; pas en dev pour http://.
 * - `sameSite: lax` et `path: /` : valeurs par défaut de @supabase/ssr.
 * - `maxAge` : 400 jours, valeur par défaut de @supabase/ssr (explicite ici
 *   pour la réécriture des anciens cookies, voir `AUTH_COOKIE_VERSION`).
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: false,
  secure: process.env.NODE_ENV === "production",
  maxAge: 400 * 24 * 60 * 60,
};

/**
 * CM-88 : les cookies de session posés avant CM-88 sont `httpOnly`, donc
 * invisibles pour le client navigateur jusqu'au prochain rafraîchissement du
 * jeton. Le middleware les réécrit une fois avec les options actuelles, puis
 * pose ce marqueur pour ne plus recommencer.
 */
export const AUTH_COOKIE_VERSION_COOKIE = "cm_auth_cookie_v";
export const AUTH_COOKIE_VERSION = "2";

/** Faut-il réécrire les cookies de session avec les options actuelles ? */
export function needsAuthCookieRewrite(
  names: string[],
  versionValue: string | null | undefined,
): boolean {
  return versionValue !== AUTH_COOKIE_VERSION && hasSupabaseAuthCookie(names);
}

export function authEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Supabase mal configuré : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requis pour l'auth.",
    );
  }
  return { url, anonKey };
}

/** Un cookie de session Supabase est-il présent ? (`sb-<ref>-auth-token`, découpé ou non) */
export function hasSupabaseAuthCookie(names: string[]): boolean {
  return names.some((n) => n.startsWith("sb-") && n.includes("-auth-token"));
}
