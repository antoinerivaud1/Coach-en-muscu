/**
 * CM-86 : onboarding solo. Logique pure (aucun import Next ni Supabase),
 * testée dans tests/unit/onboarding.spec.ts.
 *
 * - drapeau d'inscription (`NEXT_PUBLIC_SIGNUP_ENABLED`, affichage seulement) ;
 * - validation du profil saisi à l'onboarding et dans « Mon profil »
 *   (prénom, couleur, objectif hebdo) ;
 * - règle de redirection vers `/onboarding` (appliquée par le middleware) ;
 * - CM-103 : destination de fin d'onboarding (`next` conservé depuis un lien
 *   d'invitation).
 */

import { isMemberColor, type MemberColor } from "@/lib/members";
import { isPublicPath } from "@/lib/auth/publicPaths";
import { isValidInviteCode, normalizeInviteCode } from "@/lib/duo";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  isValidEmail,
  normalizeEmail,
  safeNextPath,
  withNext,
} from "@/lib/auth/core";

// ---- Drapeau d'inscription ---------------------------------------------------

/**
 * Inscription ouverte à l'affichage ? CM-88 (PR 7) : variable PUBLIQUE
 * `NEXT_PUBLIC_SIGNUP_ENABLED`, gravée au build (`signupOpen`,
 * lib/data/auth.ts), désactivée par défaut : l'app n'est pas encore publique
 * et l'inscription est fermée dans Supabase prod (la vraie barrière). Seules
 * les valeurs `1` et `true` l'ouvrent (la CI e2e build avec `1`).
 */
export function isSignupEnabled(value: string | null | undefined): boolean {
  const v = (value ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

// ---- Profil : prénom, couleur, objectif ------------------------------------

export const FIRST_NAME_MAX_LENGTH = 30;

export const WEEKLY_GOAL_MIN = 1;
export const WEEKLY_GOAL_MAX = 7;
/** Objectif proposé par défaut (défaut de la colonne en base). */
export const DEFAULT_WEEKLY_GOAL = 3;

/** Prénom nettoyé : espaces en bord retirés, espaces internes réduits à un. */
export function normalizeFirstName(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

export function validateFirstName(
  raw: string | null | undefined,
): { ok: true; value: string } | { ok: false; error: string } {
  const value = normalizeFirstName(raw);
  if (!value) return { ok: false, error: "Indique ton prénom." };
  if ([...value].length > FIRST_NAME_MAX_LENGTH) {
    return { ok: false, error: `${FIRST_NAME_MAX_LENGTH} caractères maximum.` };
  }
  // Caractères de contrôle : refusés (le prénom s'affiche partout).
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return { ok: false, error: "Ce prénom contient des caractères invalides." };
  }
  return { ok: true, value };
}

/** Objectif hebdo : entier de 1 à 7 (contrainte `profiles_weekly_goal_range`). */
export function parseWeeklyGoal(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isInteger(n)) return null;
  if (n < WEEKLY_GOAL_MIN || n > WEEKLY_GOAL_MAX) return null;
  return n;
}

/** Ramène un objectif dans ses bornes (boutons − / +). */
export function clampWeeklyGoal(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_WEEKLY_GOAL;
  return Math.min(WEEKLY_GOAL_MAX, Math.max(WEEKLY_GOAL_MIN, Math.round(n)));
}

export type IdentityFieldErrors = Partial<
  Record<"displayName" | "accentColor" | "weeklyGoal", string>
>;

export type IdentityInput = {
  displayName: string;
  accentColor: MemberColor;
  weeklyGoal: number;
};

/** Formulaire de profil (onboarding et section « Mon profil »). */
export function validateIdentityInput(input: {
  displayName: unknown;
  accentColor: unknown;
  weeklyGoal: unknown;
}): { ok: true; value: IdentityInput } | { ok: false; errors: IdentityFieldErrors } {
  const errors: IdentityFieldErrors = {};

  const name = validateFirstName(
    typeof input.displayName === "string" ? input.displayName : "",
  );
  if (!name.ok) errors.displayName = name.error;

  if (!isMemberColor(input.accentColor)) {
    errors.accentColor = "Choisis une couleur.";
  }

  const goal = parseWeeklyGoal(input.weeklyGoal);
  if (goal === null) {
    errors.weeklyGoal = `Entre ${WEEKLY_GOAL_MIN} et ${WEEKLY_GOAL_MAX} séances par semaine.`;
  }

  if (!name.ok || !isMemberColor(input.accentColor) || goal === null) {
    return { ok: false, errors };
  }
  return {
    ok: true,
    value: { displayName: name.value, accentColor: input.accentColor, weeklyGoal: goal },
  };
}

/** Initiale affichée dans l'avatar (premier caractère du prénom, en capitale). */
export function initialOf(name: string | null | undefined): string {
  const first = [...normalizeFirstName(name)][0];
  return first ? first.toLocaleUpperCase("fr-FR") : "?";
}

// ---- Redirection vers l'onboarding -------------------------------------------

export const ONBOARDING_PATH = "/onboarding";

/**
 * Chemins jamais redirigés vers l'onboarding : l'onboarding lui-même, l'accueil
 * avant compte (bienvenue, inscription, connexion), les pages publiques
 * (légal, support) et les routes API.
 */
const ONBOARDING_EXEMPT_PREFIXES: readonly string[] = [
  ONBOARDING_PATH,
  "/login",
  "/signup",
  "/welcome",
  "/api",
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isOnboardingExemptPath(pathname: string | null | undefined): boolean {
  if (!pathname || !pathname.startsWith("/")) return false;
  if (isPublicPath(pathname)) return true;
  return ONBOARDING_EXEMPT_PREFIXES.some((p) => matchesPrefix(pathname, p));
}

/**
 * État d'onboarding connu du middleware :
 * - `done` : `onboarded_at` renseigné ;
 * - `pending` : profil lu, `onboarded_at` null ;
 * - `unknown` : profil illisible (erreur réseau, pas de ligne). On laisse
 *   passer : l'onboarding est un confort, jamais un contrôle d'accès.
 */
export type OnboardingState = "done" | "pending" | "unknown";

/**
 * Où envoyer la requête, ou null pour la laisser passer. CM-103 : un lien
 * d'invitation (`/duo/rejoindre?code=…`) ouvert avant la fin de l'onboarding
 * est conservé en `next`, pour finir sur la confirmation de l'invitation.
 * `search` : query de la requête (`?code=…`), facultative.
 */
export function onboardingRedirectTarget(
  pathname: string,
  state: OnboardingState,
  search = "",
): string | null {
  if (state !== "pending") return null;
  if (isOnboardingExemptPath(pathname)) return null;
  const code = invitationCodeFromPath(`${pathname}${search}`);
  return code ? withNext(ONBOARDING_PATH, invitationJoinPath(code)) : ONBOARDING_PATH;
}

/**
 * Cookie de confort posé une fois l'onboarding constaté : sa valeur est l'id du
 * compte. Tant qu'il correspond à la session, le middleware ne relit pas le
 * profil à chaque requête. Ce n'est PAS un contrôle d'accès : un cookie
 * falsifié ne fait que sauter la redirection vers l'onboarding.
 */
export const ONBOARDED_COOKIE = "cm_onboarded";

/** Options du cookie de confort : un an, illisible en JS. */
export const ONBOARDED_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax" as const,
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
};

/** Le cookie atteste-t-il l'onboarding de CE compte ? */
export function onboardedCookieMatches(
  cookieValue: string | null | undefined,
  userId: string,
): boolean {
  return !!cookieValue && cookieValue === userId;
}

/** Destinations autorisées en fin d'onboarding (pas d'URL libre). */
export const ONBOARDING_EXITS = ["/dashboard", "/seances/new"] as const;
export type OnboardingExit = (typeof ONBOARDING_EXITS)[number];

export function safeOnboardingExit(raw: unknown): OnboardingExit {
  return (ONBOARDING_EXITS as readonly unknown[]).includes(raw)
    ? (raw as OnboardingExit)
    : "/dashboard";
}

// ---- CM-103 : invitation conservée pendant l'inscription -----------------------

const INVITE_JOIN_PATH = "/duo/rejoindre";
const INVITE_CONFIRM_PATH = "/duo/rejoindre/confirmer";

/** Lien d'invitation canonique (saisie du code, pré-remplie). */
function invitationJoinPath(code: string): string {
  return `${INVITE_JOIN_PATH}?code=${code}`;
}

/**
 * Code d'invitation porté par un chemin interne `/duo/rejoindre?code=…` ou
 * `/duo/rejoindre/confirmer?code=…`, sinon null (autre chemin, code
 * incomplet, chemin refusé par `safeNextPath`).
 */
export function invitationCodeFromPath(path: string | null | undefined): string | null {
  const safe = safeNextPath(path, "");
  if (!safe) return null;
  let url: URL;
  try {
    url = new URL(safe, "http://interne.invalid");
  } catch {
    return null;
  }
  if (url.pathname !== INVITE_JOIN_PATH && url.pathname !== INVITE_CONFIRM_PATH) return null;
  const code = normalizeInviteCode(url.searchParams.get("code"));
  return isValidInviteCode(code) ? code : null;
}

/** Étapes d'avant compte et d'onboarding : jamais une destination finale. */
const NOT_A_DESTINATION: readonly string[] = [ONBOARDING_PATH, "/signup", "/welcome"];

/**
 * Destination une fois `onboarded_at` posé :
 * - `next` sûr (conservé depuis `/login?next=…`) : on y va ; un lien
 *   d'invitation mène directement à l'écran de CONFIRMATION de l'invitation ;
 * - sinon la sortie choisie (`/dashboard` ou `/seances/new`).
 */
export function onboardingDestination(exit: unknown, next: unknown): string {
  const safe = safeNextPath(typeof next === "string" ? next : "", "");
  const pathname = safe.split(/[?#]/)[0] ?? "";
  if (safe && !NOT_A_DESTINATION.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const code = invitationCodeFromPath(safe);
    return code ? `${INVITE_CONFIRM_PATH}?code=${code}` : safe;
  }
  return safeOnboardingExit(exit);
}

// ---- Inscription -----------------------------------------------------------------

export type SignupFieldErrors = Partial<Record<"email" | "password", string>>;

/**
 * Formulaire d'inscription (maquette 2) : email + mot de passe, sans
 * confirmation (le bouton « Afficher » remplace la double saisie). Mêmes
 * bornes que le reste de l'auth (lib/auth/core.ts).
 */
export function validateSignupInput(input: {
  email: string;
  password: string;
}): { ok: true; email: string; password: string } | { ok: false; errors: SignupFieldErrors } {
  const email = normalizeEmail(input.email);
  const errors: SignupFieldErrors = {};
  if (!email) errors.email = "Saisis ton email.";
  else if (!isValidEmail(email)) errors.email = "Cet email n'a pas l'air valide.";
  const password = input.password ?? "";
  if (!password) errors.password = "Choisis un mot de passe.";
  else if (password.length < PASSWORD_MIN_LENGTH)
    errors.password = `${PASSWORD_MIN_LENGTH} caractères minimum.`;
  else if (new TextEncoder().encode(password).length > PASSWORD_MAX_LENGTH)
    errors.password = `${PASSWORD_MAX_LENGTH} caractères maximum.`;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, email, password };
}
