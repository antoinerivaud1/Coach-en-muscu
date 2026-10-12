import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { LEGACY_PROFILE_COOKIE } from "@/lib/auth/core";
import { LEGACY_ONBOARDED_COOKIE } from "@/lib/onboarding";

// CM-58 : rafraîchissement de la session Supabase. Next 15 : le fichier s'appelle bien
// `middleware.ts` (`proxy.ts` est le nom Next 16).
export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  // CM-89 (PR 1) : anciens cookies effacés s'ils traînent encore. Web
  // seulement : l'app native n'en a jamais eu.
  // - `cm_profile` (ancien sélecteur de profil) : effacé jusqu'ici par la
  //   route `/` (app/route.ts), devenue une page client ;
  // - `cm_onboarded` (httpOnly) : cookie de confort de l'ancienne redirection
  //   vers l'onboarding, remplacé par un mémo `localStorage` (OnboardingGate).
  for (const name of [LEGACY_PROFILE_COOKIE, LEGACY_ONBOARDED_COOKIE]) {
    if (request.cookies.has(name)) response.cookies.delete(name);
  }
  return response;
}

export const config = {
  matcher: [
    /*
     * Tout sauf :
     * - _next/static, _next/image (assets du build)
     * - favicon.ico, manifest.webmanifest, sw.js (PWA)
     * - icons/ et fichiers image
     * - monitoring (tunnel Sentry, CM-95 : pas de session Supabase à rafraîchir)
     */
    "/((?!_next/static|_next/image|monitoring|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
