import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
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
 */
export async function createClient() {
  const cookieStore = await cookies();

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
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component context, ignore
        }
      },
    },
  });
}
