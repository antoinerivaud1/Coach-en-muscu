import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { createBrowserClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { AUTH_COOKIE_OPTIONS, invitationCodePage, isCodeVerifierCookie } from "./auth-config";
import {
  clearPreferencesSession,
  clearSessionCookies,
  createPreferencesStorage,
} from "./nativeSession";

export type BrowserSupabase = SupabaseClient<Database>;

/**
 * CM-89 (PR 4) : app native (bundle embarqué, `capacitor://localhost`) ?
 * En cas de doute, non : le web garde son comportement.
 */
function isNativeApp(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * CM-88 : client Supabase du NAVIGATEUR, clé anon uniquement. Les requêtes
 * partent avec le JWT de l'utilisateur connecté et passent sous RLS (CM-59),
 * exactement comme le client utilisateur côté serveur.
 *
 * Session, selon la plateforme :
 * - Web : cookies (`@supabase/ssr`), mêmes options que le middleware, qui les
 *   rafraîchit et les réécrit (auth-config.ts). Inchangé.
 * - Natif (CM-89 (PR 4)) : Capacitor Preferences (`createPreferencesStorage`).
 *   Pas de serveur ni de middleware dans le bundle embarqué, donc aucune
 *   raison de passer par des cookies. `detectSessionInUrl` faux : l'app ne
 *   reçoit aucun retour d'authentification par URL, et un `?code=`
 *   d'invitation (`/duo/rejoindre?code=…`) ne doit jamais être pris pour un.
 *
 * Jamais de clé service-role ici : seules les variables `NEXT_PUBLIC_` sont
 * lisibles dans le navigateur.
 */
export function createClient(): BrowserSupabase {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  if (isNativeApp()) {
    return createSupabaseClient<Database>(url, anonKey, {
      auth: {
        storage: createPreferencesStorage(Preferences),
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        // Comme le client web (@supabase/ssr) : même flux, et prêt pour un
        // futur retour OAuth natif par lien profond (CM-96 / CM-100).
        flowType: "pkce",
      },
    });
  }
  return createBrowserClient<Database>(url, anonKey, { cookieOptions: AUTH_COOKIE_OPTIONS });
}

let browserClient: BrowserSupabase | null = null;

/**
 * CM-88 (PR 7) : sur un écran d'invitation (`/duo/rejoindre…`, voir
 * `invitationCodePage`), efface le « code verifier » PKCE laissé par une
 * inscription (voir `isCodeVerifierCookie`). Sans lui, le client navigateur
 * ignore le `?code=` du lien d'invitation au lieu de le prendre pour un
 * retour d'authentification, dont l'échec fermerait la session.
 *
 * Appelé AVANT la création du client, qui lit l'URL une seule fois, à son
 * initialisation (premier chargement de la page) : c'est donc le chemin de
 * ce premier chargement qui compte. Une navigation dans l'app vers
 * `/duo/rejoindre?code=` ne relit pas l'URL et n'a rien à purger.
 *
 * Ailleurs, rien n'est effacé : un futur flux PKCE (lien magique,
 * réinitialisation, OAuth web CM-96 / CM-100) garde son verifier. Limite :
 * son retour ne doit jamais viser `/duo/rejoindre…`.
 *
 * CM-89 (PR 4) : web seulement. Le client natif ne lit jamais l'URL
 * (`detectSessionInUrl` faux) : le verifier que `signUp` range dans
 * Preferences (`sb-…-auth-token-code-verifier`) ne peut donc jamais être
 * confronté au `?code=` d'une invitation. Il part avec la session à la
 * déconnexion (`signOut`, sinon `clearPreferencesSession`).
 */
function purgeCodeVerifierCookies(): void {
  if (typeof document === "undefined") return;
  if (!invitationCodePage(window.location.pathname)) return;
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim() ?? "";
    if (isCodeVerifierCookie(name)) {
      document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
    }
  }
}

/** Client navigateur unique pour toute l'app (une seule session, un seul écouteur d'auth). */
export function getSupabaseBrowserClient(): BrowserSupabase {
  if (!browserClient) {
    if (!isNativeApp()) purgeCodeVerifierCookies();
    browserClient = createClient();
  }
  return browserClient;
}

/**
 * CM-89 (PR 4) : efface la session de CET appareil, sans réseau, quand
 * `signOut` n'a pas pu le faire (déconnexion en échec, compte supprimé).
 * Web : cookies `sb-…-auth-token*`. Natif : clés de session dans
 * Preferences ; sans ça, l'app se rouvrirait connectée au prochain lancement.
 */
export async function clearLocalSession(): Promise<void> {
  if (isNativeApp()) {
    await clearPreferencesSession(Preferences);
    return;
  }
  if (typeof document !== "undefined") clearSessionCookies(document);
}
