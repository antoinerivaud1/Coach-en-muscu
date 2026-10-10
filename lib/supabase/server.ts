import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";
import { AUTH_COOKIE_OPTIONS, authEnv } from "./auth-config";

/**
 * CM-59 B : client Supabase de l'UTILISATEUR, utilisé par toutes les pages et
 * server actions. Clé anon + cookies de session (lecture et écriture) : les
 * requêtes partent avec le JWT de l'utilisateur connecté et passent sous RLS
 * (rôle `authenticated`, policies par duo de CM-59 A). La base garantit le
 * périmètre des données ; les contrôles d'appartenance du code restent en place
 * (ceinture et bretelles).
 *
 * Filet de déploiement : si `DATA_CLIENT=service` (variable serveur Vercel),
 * on revient à l'ancien client service-role, qui contourne la RLS. À utiliser
 * uniquement en cas d'incident (puis Redeploy) ; il sera retiré avec la clé
 * service-role après 7 jours sans incident.
 *
 * Ne jamais utiliser `getSession()` pour décider d'un accès côté serveur :
 * seul `getClaims()` valide le JWT.
 */
export async function createClient() {
  if (process.env.DATA_CLIENT === "service") {
    warnServiceFallback();
    return createServiceRoleClient();
  }
  return createUserClient();
}

let serviceFallbackWarned = false;

/**
 * Une ligne dans les logs (Vercel, CI) quand le filet est actif : on sait
 * toujours si la RLS est contournée. La CI s'en sert pour prouver que les e2e
 * du filet passent bien par ce client.
 */
function warnServiceFallback() {
  if (serviceFallbackWarned) return;
  serviceFallbackWarned = true;
  console.warn("[CM-59] DATA_CLIENT=service : client service-role actif, RLS contournée.");
}

/**
 * Client réservé à l'auth (`getClaims`, `signInWithPassword`, `signOut`).
 * Toujours le client utilisateur, MÊME avec `DATA_CLIENT=service` : le filet ne
 * concerne que les données, la session doit continuer d'être lue et écrite
 * dans les cookies (sinon plus personne ne pourrait se connecter).
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

/**
 * Ancien client (CM-17), conservé uniquement pour le filet `DATA_CLIENT=service`.
 * Clé `service_role` : contourne la RLS. Ne lit AUCUN cookie, sinon supabase-js
 * enverrait le JWT de l'utilisateur à la place de la clé.
 *
 * IMPORTANT : `SUPABASE_SERVICE_ROLE_KEY` ne doit JAMAIS être préfixée
 * `NEXT_PUBLIC_` ni utilisée dans un composant client.
 */
function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase mal configuré : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis avec DATA_CLIENT=service.",
    );
  }

  return createServerClient<Database>(url, serviceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // Jamais de cookie de session pour le client service-role.
      },
    },
  });
}
