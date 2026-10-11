import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { AUTH_COOKIE_OPTIONS } from "./auth-config";

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

/** Client navigateur unique pour toute l'app (une seule session, un seul écouteur d'auth). */
export function getSupabaseBrowserClient(): BrowserSupabase {
  browserClient ??= createClient();
  return browserClient;
}
