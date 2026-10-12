import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/auth/publicPaths";
import {
  AUTH_COOKIE_OPTIONS,
  AUTH_COOKIE_VERSION_COOKIE,
  authCookieMarker,
  authEnv,
  hasSupabaseAuthCookie,
  needsAuthCookieRewrite,
} from "./auth-config";

/**
 * CM-58 : rafraîchit la session Supabase à chaque requête (motif officiel
 * @supabase/ssr pour Next 15 : https://supabase.com/docs/guides/auth/server-side/nextjs).
 * Les Server Components ne peuvent pas écrire de cookies : c'est ici que les
 * jetons expirés sont renouvelés, puis réinjectés dans la requête pour que les
 * pages voient la session à jour.
 *
 * - Pas de cookie de session : rien à rafraîchir, on passe.
 * - L'accès aux données est contrôlé par la RLS (client navigateur) ; les
 *   écrans privés renvoient vers /login sans session (`useRequireProfileId`).
 * - CM-89 (PR 1) : plus aucune redirection ici. Celle vers `/onboarding`
 *   (CM-86) est faite dans le navigateur (`OnboardingGate`), seule possible
 *   dans le bundle natif sans serveur ; le cookie `cm_onboarded` n'est plus
 *   ni lu ni posé (effacé s'il traîne, middleware.ts). Ce middleware
 *   n'existe que sur le web (Vercel).
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
  const { data: claimsData } = await supabase.auth.getClaims();

  // CM-88 : cookies de session réécrits avec les options actuelles (lisibles
  // par le navigateur, 400 jours) quand le marqueur ne correspond plus à la
  // session reçue, et toujours sur `/login` (voir auth-config.ts).
  const requestCookies = request.cookies.getAll();
  if (
    claimsData &&
    needsAuthCookieRewrite(requestCookies, request.cookies.get(AUTH_COOKIE_VERSION_COOKIE)?.value, {
      force: request.nextUrl.pathname === "/login",
    })
  ) {
    for (const c of requestCookies) {
      if (!hasSupabaseAuthCookie([c.name]) || supabaseResponse.cookies.get(c.name)) continue;
      supabaseResponse.cookies.set(c.name, c.value, AUTH_COOKIE_OPTIONS);
    }
    // Empreinte de la session telle que le navigateur la gardera : valeurs
    // rafraîchies par getClaims ci-dessus si c'est le cas, sinon celles reçues.
    const finalCookies = requestCookies
      .map((c) => ({ name: c.name, value: supabaseResponse.cookies.get(c.name)?.value ?? c.value }))
      .concat(
        supabaseResponse.cookies
          .getAll()
          .filter((c) => !request.cookies.has(c.name))
          .map((c) => ({ name: c.name, value: c.value })),
      );
    supabaseResponse.cookies.set(AUTH_COOKIE_VERSION_COOKIE, authCookieMarker(finalCookies), {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 400 * 24 * 60 * 60,
    });
  }

  // On renvoie TEL QUEL l'objet portant les cookies rafraîchis.
  return supabaseResponse;
}
