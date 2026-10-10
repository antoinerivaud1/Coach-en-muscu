// CM-93 : chemins consultables sans compte (exigence App Store : la politique
// de confidentialité et le support doivent être accessibles publiquement).
// Logique pure, sans import Next : testée dans tests/unit/publicPaths.spec.ts.

/** Préfixes publics : le chemin lui-même et tout ce qui est en dessous. */
export const PUBLIC_PATH_PREFIXES: readonly string[] = ["/legal", "/support"];

/**
 * Le chemin (pathname seul, sans query ni hash) est-il public ?
 * `/legal`, `/legal/cgu`, `/support`, `/support/` : oui.
 * `/legalese`, `/supports`, `/profile/legal` : non (correspondance par segment).
 */
export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname || !pathname.startsWith("/")) return false;
  return PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
