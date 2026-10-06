import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";
import { AUTH_COOKIE_OPTIONS, authEnv } from "./auth-config";

/**
 * CM-58 : client Supabase côté serveur À LA CLÉ ANON, réservé à l'auth
 * (`getClaims`, `signInWithPassword`, `signOut`). Il lit et écrit les cookies
 * de session. Ne sert JAMAIS à lire ou écrire des données : les données
 * passent encore par le client service-role de `lib/supabase/server.ts`
 * (CM-59 changera ça).
 *
 * Ne jamais utiliser `getSession()` pour décider d'un accès côté serveur :
 * seul `getClaims()` valide le JWT.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = authEnv();

  return createServerClient<Database>(url, anonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Appelé depuis un Server Component (cookies en lecture seule) :
          // sans effet, le middleware rafraîchit la session à chaque requête.
        }
      },
    },
  });
}
