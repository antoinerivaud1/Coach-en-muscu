// CM-58 : logique pure de l'authentification (aucun import Next ni Supabase),
// testée dans tests/unit/auth.spec.ts.

/**
 * CM-58 / CM-59 B : qui est l'utilisateur courant. Seule la session Supabase
 * compte (`claims.sub`, JWT validé par `getClaims()`) ; sans session, personne.
 * `profiles.id = auth.users.id` : l'id de session EST l'id de profil.
 */
export function resolveProfileId(sessionUserId: string | null | undefined): string | null {
  return sessionUserId || null;
}

/**
 * Ancien cookie du sélecteur de profil (avant CM-59 B). Plus lu nulle part :
 * seulement effacé s'il traîne encore dans un navigateur.
 */
export const LEGACY_PROFILE_COOKIE = "cm_profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string | null | undefined): value is string {
  return !!value && UUID_RE.test(value);
}

/**
 * CM-58 : destination après connexion. Uniquement un chemin interne
 * (`/xxx`), jamais `//hote`, `/\hote`, une URL absolue ni un schéma : pas
 * d'open redirect via `/login?next=`.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/dashboard"): string {
  const v = (raw ?? "").trim();
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  // Caractères de contrôle ou antislash : rejetés (certains navigateurs
  // normalisent `\` en `/`).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\\]/.test(v)) return fallback;
  if (v === "/login" || v.startsWith("/login?") || v.startsWith("/login/")) return fallback;
  return v;
}

export const PASSWORD_MIN_LENGTH = 8;
// Limite bcrypt de Supabase Auth (72 octets) : au-delà, le reste est ignoré.
export const PASSWORD_MAX_LENGTH = 72;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

export type FieldErrors = Partial<Record<"email" | "password" | "confirm", string>>;

/** Formulaire `/login`. */
export function validateLoginInput(input: {
  email: string;
  password: string;
}): { ok: true; email: string; password: string } | { ok: false; errors: FieldErrors } {
  const email = normalizeEmail(input.email);
  const errors: FieldErrors = {};
  if (!email) errors.email = "Saisis ton email.";
  else if (!isValidEmail(email)) errors.email = "Cet email n'a pas l'air valide.";
  if (!input.password) errors.password = "Saisis ton mot de passe.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, email, password: input.password };
}

/**
 * Choix d'un mot de passe (email, mot de passe, confirmation). Son seul écran
 * (bloc « Créer mon mot de passe » du Profil) a disparu avec CM-59 B ; gardé
 * pour l'inscription et la réinitialisation à venir.
 */
export function validatePasswordCreation(input: {
  email: string;
  password: string;
  confirm: string;
}): { ok: true; email: string; password: string } | { ok: false; errors: FieldErrors } {
  const email = normalizeEmail(input.email);
  const errors: FieldErrors = {};
  if (!email) errors.email = "Saisis ton email.";
  else if (!isValidEmail(email)) errors.email = "Cet email n'a pas l'air valide.";
  const { password, confirm } = input;
  if (!password) errors.password = "Choisis un mot de passe.";
  else if (password.length < PASSWORD_MIN_LENGTH)
    errors.password = `Au moins ${PASSWORD_MIN_LENGTH} caractères.`;
  else if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH)
    errors.password = `${PASSWORD_MAX_LENGTH} caractères maximum.`;
  if (!errors.password && password !== confirm)
    errors.confirm = "Les deux mots de passe ne correspondent pas.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, email, password };
}

/**
 * Erreur Supabase Auth (code / statut) → message en français. Les détails
 * techniques ne sont jamais renvoyés à l'écran.
 */
export function authErrorMessage(err: { code?: string | null; status?: number | null } | null): string {
  switch (err?.code) {
    case "invalid_credentials":
      return "Email ou mot de passe incorrect.";
    case "email_not_confirmed":
      return "Cet email n'est pas encore confirmé.";
    case "user_banned":
      return "Ce compte est désactivé.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Trop de tentatives. Réessaie dans quelques minutes.";
    case "email_exists":
    case "user_already_exists":
      return "Cet email est déjà utilisé par un autre compte.";
    case "weak_password":
      return "Mot de passe trop faible, choisis-en un plus long ou moins courant.";
    case "signup_disabled":
      return "La création de compte est désactivée.";
  }
  if (err?.status === 429) return "Trop de tentatives. Réessaie dans quelques minutes.";
  return "Une erreur est survenue. Réessaie dans un instant.";
}
