// CM-59 B : refus de la RLS, logique pure (aucun import Next ni Supabase),
// testée dans tests/unit/rlsErrors.spec.ts.
//
// Sous le client utilisateur, la base refuse de deux façons :
// (NB : 42501 n'est pas toujours un refus légitime. PostgREST le renvoie aussi
// pour une requête partie sans JWT, donc en anon, ou pour un grant manquant.
// Les files hors ligne le traitent donc comme REJOUABLE ; seul le contrôle
// d'appartenance du code, ou un update / delete à 0 ligne, est définitif.)
// - un insert (ou un upsert) hors policy échoue avec le code Postgres 42501
//   (« new row violates row-level security policy ») ;
// - un update ou un delete hors policy NE PLANTE PAS : il touche 0 ligne. Les
//   server actions demandent donc `.select("id")` et traitent 0 ligne comme un
//   refus.

/** Code Postgres d'un refus de droits ou de RLS (insufficient_privilege). */
export const RLS_DENIED_CODE = "42501";

/** Message montré à l'utilisateur pour tout refus : aucun détail technique. */
export const REFUSED_MESSAGE =
  "Action refusée : ces données ne sont pas accessibles depuis ton compte.";

/**
 * Server action appelée sans session valide (jeton expiré en pleine séance).
 * Rejouable : la file garde l'opération et la rejoue après reconnexion.
 */
export const SESSION_EXPIRED_MESSAGE = "Session expirée";

export function isRlsDenied(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === RLS_DENIED_CODE;
}

/**
 * Message d'erreur d'une écriture : refus RLS en message générique, toute
 * autre erreur telle quelle (comportement antérieur inchangé).
 */
export function writeErrorMessage(error: { code?: string | null; message: string }): string {
  return isRlsDenied(error) ? REFUSED_MESSAGE : error.message;
}

/** Un update / delete avec `.select("id")` a-t-il réellement touché une ligne ? */
export function touchedRows(data: readonly unknown[] | null | undefined): boolean {
  return (data?.length ?? 0) > 0;
}
