import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/auth/publicPaths";
import { AUTH_COOKIE_OPTIONS, authEnv, hasSupabaseAuthCookie } from "./auth-config";

/**
 * CM-58 : rafraîchit la session Supabase à chaque requête (motif officiel
 * @supabase/ssr pour Next 15 : https://supabase.com/docs/guides/auth/server-side/nextjs).
 * Les Server Components ne peuvent pas écrire de cookies : c'est ici que les
 * jetons expirés sont renouvelés, puis réinjectés dans la requête pour que les
 * pages voient la session à jour.
 *
 * - Pas de cookie de session : rien à rafraîchir, on passe.
 * - Aucune redirection ici : l'accès est contrôlé côté serveur par
 *   `requireProfileId()` (lib/profile.ts), ce qui couvre aussi les server actions.
 */
export async function updateSession(request: NextRequest) {
  // CM-93 : pages légales et support publiques. Aucun appel Supabase : elles
  // restent servies même sans session, sans config Auth ou si Supabase est
  // indisponible (URLs déclarées dans App Store Connect).
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  if (!hasSupabaseAuthCookie(request.cookies.getAll().map((c) => c.name))) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({ request });
  const { url, anonKey } = authEnv();

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: AUTH_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // Aucun code entre createServerClient et getClaims() (consigne Supabase :
  // sinon déconnexions aléatoires). getClaims valide le JWT et le rafraîchit
  // si besoin, via setAll ci-dessus.
  await supabase.auth.getClaims();

  // On renvoie TEL QUEL l'objet portant les cookies rafraîchis.
  return supabaseResponse;
}
