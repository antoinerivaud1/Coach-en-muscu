import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";
import { AUTH_COOKIE_OPTIONS, authEnv } from "./auth-config";

/**
 * Client Supabase SERVEUR de l'utilisateur (clé anon + cookies de session).
 *
 * CM-88 (PR 8) : plus aucun écran ne lit ni n'écrit de données côté serveur
 * (tout passe par le client navigateur, sous RLS). Ce client ne sert plus
 * qu'à l'auth de la requête : `getClaims()` dans `lib/profile.ts` (redirection
 * de `/`). Le filet `DATA_CLIENT=service` et le client service-role sont
 * supprimés : la clé `SUPABASE_SERVICE_ROLE_KEY` n'est plus lue nulle part.
 *
 * Ne jamais utiliser `getSession()` pour décider d'un accès côté serveur :
 * seul `getClaims()` valide le JWT.
 */
export async function createAuthClient() {
  return createUserClient();
}

async function createUserClient() {
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
