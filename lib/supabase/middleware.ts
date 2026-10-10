import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isPublicPath } from "@/lib/auth/publicPaths";
import { isUuid } from "@/lib/auth/core";
import {
  ONBOARDED_COOKIE,
  ONBOARDED_COOKIE_OPTIONS,
  isOnboardingExemptPath,
  onboardedCookieMatches,
  onboardingRedirectTarget,
  type OnboardingState,
} from "@/lib/onboarding";
import { AUTH_COOKIE_OPTIONS, authEnv, hasSupabaseAuthCookie } from "./auth-config";

/**
 * CM-58 : rafraîchit la session Supabase à chaque requête (motif officiel
 * @supabase/ssr pour Next 15 : https://supabase.com/docs/guides/auth/server-side/nextjs).
 * Les Server Components ne peuvent pas écrire de cookies : c'est ici que les
 * jetons expirés sont renouvelés, puis réinjectés dans la requête pour que les
 * pages voient la session à jour.
 *
 * - Pas de cookie de session : rien à rafraîchir, on passe.
 * - L'accès reste contrôlé côté serveur par `requireProfileId()`
 *   (lib/profile.ts), ce qui couvre aussi les server actions.
 * - CM-86 : seule redirection d'ici, un compte connecté qui n'a pas terminé
 *   l'onboarding (`profiles.onboarded_at` null) est envoyé vers `/onboarding`
 *   (règle pure `onboardingRedirectTarget`, lib/onboarding.ts). C'est un
 *   parcours, pas un contrôle d'accès : en cas de doute, on laisse passer.
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

  // CM-86 : onboarding pas terminé => /onboarding.
  const userId = claimsData?.claims?.sub;
  const pathname = request.nextUrl.pathname;
  if (isUuid(userId) && !isOnboardingExemptPath(pathname)) {
    const cookieValue = request.cookies.get(ONBOARDED_COOKIE)?.value;
    if (!onboardedCookieMatches(cookieValue, userId)) {
      const state = await readOnboardingState(supabase, userId);
      const target = onboardingRedirectTarget(pathname, state);
      if (target) {
        const redirect = NextResponse.redirect(new URL(target, request.url));
        // Cookies de session rafraîchis par getClaims : conservés.
        supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
        return redirect;
      }
      if (state === "done") {
        // Plus besoin de relire le profil aux requêtes suivantes.
        supabaseResponse.cookies.set(ONBOARDED_COOKIE, userId, ONBOARDED_COOKIE_OPTIONS);
      }
    }
  }

  // On renvoie TEL QUEL l'objet portant les cookies rafraîchis.
  return supabaseResponse;
}

/** `onboarded_at` du compte, lu sous RLS (le profil est lisible par lui-même). */
async function readOnboardingState(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<OnboardingState> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return "unknown";
    return (data as { onboarded_at: string | null }).onboarded_at ? "done" : "pending";
  } catch {
    return "unknown";
  }
}
