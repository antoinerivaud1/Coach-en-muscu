import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";

/**
 * Client Supabase côté serveur, utilisé par toutes les pages et server actions.
 *
 * Sécurité (CM-17) : l'app identifie le profil par cookie (lib/profile.ts), pas
 * via Supabase Auth, donc `auth.uid()` est toujours null et les policies RLS
 * scoppées au couple ne peuvent pas s'appliquer. On utilise ici la clé
 * `service_role` (server-only, jamais exposée au client) qui contourne la RLS.
 * Le périmètre des données (profil / couple) est garanti par le code des
 * server actions et des requêtes, pas par la base.
 *
 * IMPORTANT : `SUPABASE_SERVICE_ROLE_KEY` ne doit JAMAIS être préfixée
 * `NEXT_PUBLIC_` ni utilisée dans un composant client.
 *
 * CM-58 : ce client ne lit AUCUN cookie. Sinon, dès qu'un cookie de session
 * Supabase existe (modes `hybrid` / `required`), supabase-js enverrait le JWT
 * de l'utilisateur à la place de la clé service-role : les requêtes passeraient
 * sous RLS (rôle `authenticated`) avec des policies encore écrites pour
 * l'ancien modèle. La session est gérée à part par `lib/supabase/auth-server.ts`.
 * Sert aussi pour l'API admin Auth (`auth.admin.*`, CM-58).
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase mal configuré : NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis côté serveur.",
    );
  }

  return createServerClient<Database>(url, serviceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // CM-58 : jamais de cookie de session pour le client service-role.
      },
    },
  });
}
