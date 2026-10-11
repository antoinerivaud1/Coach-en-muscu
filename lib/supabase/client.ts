import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { AUTH_COOKIE_OPTIONS, invitationCodePage, isCodeVerifierCookie } from "./auth-config";

export type BrowserSupabase = SupabaseClient<Database>;

/**
 * CM-88 : client Supabase du NAVIGATEUR, clé anon uniquement. Les requêtes
 * partent avec le JWT de l'utilisateur connecté et passent sous RLS (CM-59),
 * exactement comme le client utilisateur côté serveur.
 *
 * Session : cookies (`@supabase/ssr`), mêmes options que le serveur. Pendant
 * la migration écran par écran, les pages serveur pas encore converties, le
 * middleware et les écrans client partagent donc la même session. Le stockage
 * natif (Capacitor Preferences) viendra avec le bundle embarqué (CM-89).
 *
 * Jamais de clé service-role ici : seules les variables `NEXT_PUBLIC_` sont
 * lisibles dans le navigateur.
 */
export function createClient(): BrowserSupabase {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookieOptions: AUTH_COOKIE_OPTIONS },
  );
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
    purgeCodeVerifierCookies();
    browserClient = createClient();
  }
  return browserClient;
}
