import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { LEGACY_PROFILE_COOKIE } from "@/lib/auth/core";

// CM-58 : rafraîchissement de la session Supabase. Next 15 : le fichier s'appelle bien
// `middleware.ts` (`proxy.ts` est le nom Next 16).
export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  // CM-89 (PR 1) : l'ancien cookie du sélecteur de profil (`cm_profile`) était
  // effacé par la route `/` (app/route.ts), devenue une page client. Web
  // seulement : l'app native n'a jamais eu ce cookie.
  if (request.cookies.has(LEGACY_PROFILE_COOKIE)) response.cookies.delete(LEGACY_PROFILE_COOKIE);
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
