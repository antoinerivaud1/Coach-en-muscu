/**
 * CM-86 : onboarding solo. Logique pure (aucun import Next ni Supabase),
 * testée dans tests/unit/onboarding.spec.ts.
 *
 * - drapeau d'inscription (`NEXT_PUBLIC_SIGNUP_ENABLED`, affichage seulement) ;
 * - validation du profil saisi à l'onboarding et dans « Mon profil »
 *   (prénom, couleur, objectif hebdo) ;
 * - règle de redirection vers `/onboarding` et mémo « onboarding fait » de
 *   l'appareil (appliqués dans le navigateur par `OnboardingGate`, CM-89
 *   (PR 1) : plus par le middleware) ;
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
 * État d'onboarding du compte connecté (lu par `OnboardingGate`) :
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
 * CM-89 (PR 1) : décision de `OnboardingGate` (components/providers), qui
 * remplace la redirection du middleware : le bundle natif (export statique,
 * Capacitor) n'a pas de serveur.
 * - `render` : afficher l'écran ;
 * - `wait` : squelette neutre, état pas encore connu (un compte pas
 *   onboardé n'entrevoit jamais un écran privé) ;
 * - `redirect` : partir vers `to` (règle `onboardingRedirectTarget`).
 *
 * Mêmes principes qu'avant : sans session (les écrans renvoient eux-mêmes
 * vers /login), session ou profil illisible, on laisse passer.
 */
export type OnboardingGateDecision =
  | { kind: "render" }
  | { kind: "wait" }
  | { kind: "redirect"; to: string };

export type OnboardingGateInput = {
  pathname: string;
  /** Query de l'URL (`?code=…`), pour conserver un lien d'invitation. */
  search?: string;
  /** Session : pas encore lue, absente, illisible (réseau) ou ouverte. */
  session: "pending" | "signedOut" | "error" | "signedIn";
  /** Onboarding déjà constaté pour CE compte sur cet appareil (`hasOnboardedMark`). */
  remembered: boolean;
  /** `loading` tant que `onboarded_at` n'est pas lu. */
  state: OnboardingState | "loading";
};

export function onboardingGateDecision(input: OnboardingGateInput): OnboardingGateDecision {
  if (isOnboardingExemptPath(input.pathname)) return { kind: "render" };
  if (input.session === "pending") return { kind: "wait" };
  if (input.session !== "signedIn" || input.remembered) return { kind: "render" };
  if (input.state === "loading") return { kind: "wait" };
  const to = onboardingRedirectTarget(input.pathname, input.state, input.search);
  return to ? { kind: "redirect", to } : { kind: "render" };
}

/**
 * CM-89 (PR 1) : écran déjà affiché par `OnboardingGate` pour cette page
 * (`pathname`) et ce compte (dernier id connecté vu, null si aucun).
 */
export type OnboardingGateLatch = { pathname: string; userId: string | null };

/**
 * CM-89 (PR 1) : une fois l'écran affiché, un `wait` passager ne le remplace
 * plus par le squelette. Sinon une session perdue en pleine séance (jeton
 * refusé, déconnexion dans un autre onglet : le cache est relu, la session
 * repasse « en cours de lecture ») démonterait le logger et son état, puis le
 * renverrait vers /login (CM-59 B : jamais de renvoi en pleine saisie, le
 * logger affiche « Session expirée »).
 *
 * Le verrou tombe sur un autre chemin, ou quand un AUTRE compte se connecte
 * (son onboarding est à vérifier). Une redirection s'applique toujours.
 * `userId` : compte connecté actuel, null si aucun ou pas encore lu.
 */
export function latchOnboardingGate(
  decision: OnboardingGateDecision,
  latch: OnboardingGateLatch | null,
  current: { pathname: string; userId: string | null },
): { decision: OnboardingGateDecision; latch: OnboardingGateLatch | null } {
  const otherUser = current.userId !== null && current.userId !== latch?.userId;
  const kept = latch && latch.pathname === current.pathname && !otherUser ? latch : null;
  if (decision.kind === "render") {
    return {
      decision,
      latch: { pathname: current.pathname, userId: current.userId ?? kept?.userId ?? null },
    };
  }
  if (decision.kind === "wait" && kept) return { decision: { kind: "render" }, latch: kept };
  return { decision, latch: kept };
}

/**
 * CM-89 (PR 1) : mémo de confort dans `localStorage` (remplace le cookie
 * httpOnly du middleware), valeur = id du compte. Tant qu'il correspond à la
 * session, `onboarded_at` n'est pas relu : un compte onboardé n'attend jamais
 * cette lecture. Ce n'est PAS un contrôle d'accès : un mémo falsifié ne fait
 * que sauter la redirection vers l'onboarding. `onboarded_at` ne revient
 * jamais à null : le mémo n'expire pas.
 */
export const ONBOARDED_STORAGE_KEY = "cm_onboarded";

/**
 * Ancien cookie de confort (httpOnly) que posait le middleware, même nom.
 * Plus lu nulle part : effacé par le middleware (web) s'il traîne encore.
 */
export const LEGACY_ONBOARDED_COOKIE = "cm_onboarded";

type MarkStorage = Pick<Storage, "getItem" | "setItem">;

/** `localStorage`, ou null (rendu serveur, stockage bloqué). */
function deviceStorage(): MarkStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Le mémo atteste-t-il l'onboarding de CE compte ? */
export function hasOnboardedMark(
  userId: string,
  storage: MarkStorage | null = deviceStorage(),
): boolean {
  try {
    const value = storage?.getItem(ONBOARDED_STORAGE_KEY);
    return !!value && value === userId;
  } catch {
    return false;
  }
}

/** Mémorise l'onboarding de ce compte sur l'appareil (un seul compte à la fois). */
export function rememberOnboarded(
  userId: string,
  storage: MarkStorage | null = deviceStorage(),
): void {
  try {
    storage?.setItem(ONBOARDED_STORAGE_KEY, userId);
  } catch {
    // Stockage indisponible (navigation privée, quota) : `onboarded_at` sera
    // relu au prochain chargement, rien de plus.
  }
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
