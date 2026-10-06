import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// CM-58 : rafraîchissement de la session Supabase. Sans effet en
// AUTH_MODE=cookie (défaut). Next 15 : le fichier s'appelle bien
// `middleware.ts` (`proxy.ts` est le nom Next 16).
export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Tout sauf :
     * - _next/static, _next/image (assets du build)
     * - favicon.ico, manifest.webmanifest, sw.js (PWA)
     * - icons/ et fichiers image
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
