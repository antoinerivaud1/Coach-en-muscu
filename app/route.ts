import { NextResponse, type NextRequest } from "next/server";
import { LEGACY_PROFILE_COOKIE } from "@/lib/auth/core";
import { getAuthState } from "@/lib/profile";

// CM-59 B : l'accueil n'est plus le sélecteur de profil (« Qui s'entraîne ? »),
// seulement une redirection : `/dashboard` avec une session, `/login` sinon.
// Route handler et non page : un Server Component ne peut pas effacer de
// cookie, or l'ancien cookie `cm_profile` du sélecteur doit disparaître s'il
// traîne encore dans le navigateur.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { profileId } = await getAuthState();
  const target = profileId ? "/dashboard" : "/login";
  const response = NextResponse.redirect(new URL(target, request.url));
  if (request.cookies.has(LEGACY_PROFILE_COOKIE)) {
    response.cookies.delete(LEGACY_PROFILE_COOKIE);
  }
  return response;
}
