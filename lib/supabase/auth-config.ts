import type { CookieOptionsWithName } from "@supabase/ssr";

// CM-58 : réglages partagés par le client d'auth serveur et le middleware.
// Aucun import de `next/headers` ici : ce fichier est chargé par le middleware.

/**
 * Options des cookies de session Supabase (`sb-<ref>-auth-token*`).
 * - `httpOnly` : aucun code navigateur n'utilise la session (le client
 *   navigateur `lib/supabase/client.ts` n'est pas branché), donc le jeton ne
 *   doit pas être lisible en JS (vol par XSS).
 * - `secure` en production (HTTPS sur Vercel) ; pas en dev pour http://.
 * - `sameSite: lax` et `path: /` : valeurs par défaut de @supabase/ssr.
 */
export const AUTH_COOKIE_OPTIONS: CookieOptionsWithName = {
  path: "/",
  sameSite: "lax",
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
};

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
