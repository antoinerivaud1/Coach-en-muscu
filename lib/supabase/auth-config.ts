import type { CookieOptionsWithName } from "@supabase/ssr";

// CM-58 : réglages partagés par le client navigateur et le middleware
// (CM-89 (PR 1) : plus de client d'auth serveur).
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
 * CM-88 : le middleware réécrit les cookies de session avec les options
 * actuelles (valeur inchangée) dès qu'ils ont pu être écrits par quelqu'un
 * d'autre que lui. Trois cas :
 * - les cookies posés avant CM-88 sont `httpOnly`, invisibles pour le client
 *   navigateur jusqu'au prochain rafraîchissement du jeton ;
 * - après un retour arrière Vercel sur une version d'avant CM-88, ils le
 *   redeviennent ;
 * - Safari (ITP) limite à 7 jours les cookies écrits par le navigateur quand
 *   il rafraîchit lui-même le jeton (séance de plus d'une heure, app ouverte) :
 *   la réécriture serveur leur rend 400 jours.
 *
 * Le marqueur `cm_auth_cookie_v` (httpOnly, posé par le serveur seulement)
 * retient la version et une empreinte de la session qu'il a écrite. Empreinte
 * différente (le navigateur a rafraîchi le jeton) ou version différente : on
 * réécrit à la requête suivante. Sur `/login` avec une session valide, la
 * réécriture est forcée : c'est là qu'aboutit un écran client qui ne voit pas
 * la session, et sans elle on tournerait entre cet écran et `/login`.
 */
export const AUTH_COOKIE_VERSION_COOKIE = "cm_auth_cookie_v";
export const AUTH_COOKIE_VERSION = "2";

type NamedCookie = { name: string; value: string };

/** Empreinte courte de la session (fin des valeurs des cookies `sb-…-auth-token*`). */
export function authCookieFingerprint(cookies: NamedCookie[]): string {
  const joined = cookies
    .filter((c) => hasSupabaseAuthCookie([c.name]) && c.value)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => c.value)
    .join("");
  return joined.slice(-16);
}

/** Valeur du marqueur pour ces cookies de session : `<version>.<empreinte>`. */
export function authCookieMarker(cookies: NamedCookie[]): string {
  return `${AUTH_COOKIE_VERSION}.${authCookieFingerprint(cookies)}`;
}

/** Faut-il réécrire les cookies de session avec les options actuelles ? */
export function needsAuthCookieRewrite(
  cookies: NamedCookie[],
  markerValue: string | null | undefined,
  options: { force?: boolean } = {},
): boolean {
  if (!hasSupabaseAuthCookie(cookies.map((c) => c.name))) return false;
  return options.force === true || markerValue !== authCookieMarker(cookies);
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

/**
 * CM-88 (PR 7) : cookie du « code verifier » PKCE de Supabase
 * (`sb-<ref>-auth-token-code-verifier`, découpé ou non). `signUp` le pose
 * (flux PKCE de @supabase/ssr, pour un lien de confirmation d'email que
 * l'app n'utilise pas) et il reste ensuite. Or, tant qu'il existe, le client
 * navigateur prend tout `?code=` de l'URL pour un retour d'authentification :
 * sur le lien d'invitation `/duo/rejoindre?code=…`, l'échange échoue et
 * Supabase FERME LA SESSION. Le client navigateur l'efface donc au démarrage,
 * mais SEULEMENT sur les écrans d'invitation (`invitationCodePage`), où
 * `?code=` est un code d'invitation et jamais un retour d'authentification
 * (lib/supabase/client.ts).
 */
export function isCodeVerifierCookie(name: string): boolean {
  return /^sb-.+-auth-token-code-verifier(\.\d+)?$/.test(name);
}

/**
 * Écrans où `?code=` est un CODE D'INVITATION (`/duo/rejoindre`,
 * `/duo/rejoindre/confirmer`) : seul endroit où le « code verifier » PKCE est
 * effacé. Partout ailleurs il est laissé tel quel, pour qu'un vrai flux PKCE
 * (lien magique, réinitialisation du mot de passe, OAuth web de CM-96 /
 * CM-100) qui reviendrait sur une autre page fonctionne.
 * Limite : un retour PKCE ne doit jamais viser ces deux chemins.
 */
export function invitationCodePage(pathname: string): boolean {
  return pathname === "/duo/rejoindre" || pathname.startsWith("/duo/rejoindre/");
}

/** Un cookie de session Supabase est-il présent ? (`sb-<ref>-auth-token`, découpé ou non) */
export function hasSupabaseAuthCookie(names: string[]): boolean {
  return names.some((n) => n.startsWith("sb-") && n.includes("-auth-token"));
}
