// CM-58 : logique pure de l'authentification (aucun import Next ni Supabase),
// testée dans tests/unit/auth.spec.ts.

/**
 * Palier de bascule de l'auth, lu côté serveur uniquement (variable d'env
 * `AUTH_MODE`, jamais un cookie : un cookie est falsifiable).
 * - `cookie`   : comportement historique, profil choisi via le cookie `cm_profile`.
 * - `hybrid`   : la session Supabase prime ; sinon repli sur le cookie.
 * - `required` : seule la session compte ; sans session, direction `/login`.
 */
export type AuthMode = "cookie" | "hybrid" | "required";

export const AUTH_MODES: readonly AuthMode[] = ["cookie", "hybrid", "required"];

/** Valeur brute de `AUTH_MODE` → mode. Absente ou inconnue : `cookie`. */
export function parseAuthMode(raw: string | null | undefined): AuthMode {
  const v = (raw ?? "").trim().toLowerCase();
  return (AUTH_MODES as readonly string[]).includes(v) ? (v as AuthMode) : "cookie";
}

export type ProfileSource = "session" | "cookie" | null;

/**
 * CM-58 : qui est l'utilisateur courant, selon le mode.
 * `profiles.id = auth.users.id` : l'id de session EST l'id de profil.
 */
export function resolveProfileId({
  mode,
  sessionUserId,
  cookieProfileId,
}: {
  mode: AuthMode;
  sessionUserId: string | null;
  cookieProfileId: string | null;
}): { profileId: string | null; source: ProfileSource } {
  const session = sessionUserId || null;
  const cookie = cookieProfileId || null;
  switch (mode) {
    case "cookie":
      return cookie ? { profileId: cookie, source: "cookie" } : { profileId: null, source: null };
    case "hybrid":
      if (session) return { profileId: session, source: "session" };
      return cookie ? { profileId: cookie, source: "cookie" } : { profileId: null, source: null };
    case "required":
      return session ? { profileId: session, source: "session" } : { profileId: null, source: null };
  }
}

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

/** Bloc « Créer mon mot de passe » de l'écran Profil. */
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

/**
 * Emails pré-remplis du bloc « Créer mon mot de passe » (le repo est public :
 * aucun email en dur). Format de `AUTH_PREFILL_EMAILS` :
 * `<uuid>=<email>,<uuid>=<email>`. Entrées invalides ignorées.
 */
export function parsePrefillEmails(raw: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (raw ?? "").split(",")) {
    const [id, email] = part.split("=").map((s) => s?.trim() ?? "");
    const e = normalizeEmail(email);
    if (isUuid(id) && isValidEmail(e)) out[id.toLowerCase()] = e;
  }
  return out;
}
