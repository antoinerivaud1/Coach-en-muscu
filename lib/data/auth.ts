import type { BrowserSupabase } from "@/lib/supabase/client";
import { sessionCookieNames } from "@/lib/accountDeletion";
import {
  authErrorMessage,
  safeNextPath,
  validateLoginInput,
  withNext,
  type FieldErrors,
} from "@/lib/auth/core";
import {
  isSignupEnabled,
  validateSignupInput,
  type SignupFieldErrors,
} from "@/lib/onboarding";

/**
 * CM-58 / CM-86 / CM-88 (PR 7) : connexion, inscription et déconnexion
 * depuis le NAVIGATEUR (client Supabase anon, session en cookie lisible).
 * Remplacent les server actions de lib/actions/auth.ts et signup.ts.
 *
 * Mêmes validations (lib/auth/core.ts, lib/onboarding.ts) et mêmes messages
 * (`authErrorMessage`) qu'avant. Un succès renvoie `redirectTo` : l'écran
 * l'ouvre par RECHARGEMENT COMPLET (`window.location.assign`), le cache du
 * navigateur repart de zéro (changement de compte). L'ancien cookie
 * `cm_profile` (httpOnly) n'est plus effacé ici : la route `/` s'en charge.
 */

type AuthClient = Pick<BrowserSupabase, "auth">;

export type AuthFormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  /** Email resaisi, pour ne pas vider le champ après une erreur. */
  email?: string;
  /** Destination après succès, à ouvrir par rechargement complet. */
  redirectTo?: string;
};

/** Connexion email + mot de passe (`/login`). `next` : chemin interne seulement. */
export async function signInWithEmail(
  supabase: AuthClient,
  input: { email: string; password: string; next: string },
): Promise<AuthFormState> {
  const parsed = validateLoginInput({ email: input.email, password: input.password });
  if (!parsed.ok) return { fieldErrors: parsed.errors, email: input.email };
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.email,
      password: parsed.password,
    });
    if (error) return { error: authErrorMessage(error), email: parsed.email };
  } catch {
    return { error: authErrorMessage(null), email: parsed.email };
  }
  // Chemin interne uniquement (pas d'open redirect).
  return { redirectTo: safeNextPath(input.next) };
}

/**
 * Inscription ouverte À L'AFFICHAGE ? `NEXT_PUBLIC_SIGNUP_ENABLED`, gravée
 * au BUILD (variable publique), fermée par défaut : seules `1` et `true`
 * l'ouvrent. Ce n'est qu'un affichage : la vraie barrière est le réglage
 * Supabase « Allow new users to sign up » (fermé en prod), qui refuse toute
 * inscription quel que soit le bundle.
 */
export function signupOpen(): boolean {
  return isSignupEnabled(process.env.NEXT_PUBLIC_SIGNUP_ENABLED);
}

export type SignupFormState = {
  error?: string;
  fieldErrors?: SignupFieldErrors;
  email?: string;
  redirectTo?: string;
};

/** Message quand l'inscription est fermée côté app. */
export const SIGNUP_CLOSED_MESSAGE = "Les inscriptions ouvriront bientôt.";

/**
 * Inscription email + mot de passe, puis onboarding. Fermée (`open` faux) :
 * refus AVANT tout appel à Supabase. Pas de confirmation d'email (pas de
 * SMTP avant CM-97) : Supabase renvoie la session tout de suite.
 * CM-103 : `next` (lien d'invitation) conservé pour la fin de l'onboarding.
 * Un cookie `cm_onboarded` d'un autre compte sur cet appareil ne saute rien :
 * le middleware compare sa valeur à l'id de la session.
 */
export async function signUpWithEmail(
  supabase: AuthClient,
  input: { email: string; password: string; next: string },
  open: boolean = signupOpen(),
): Promise<SignupFormState> {
  if (!open) return { error: SIGNUP_CLOSED_MESSAGE };
  const parsed = validateSignupInput({ email: input.email, password: input.password });
  if (!parsed.ok) return { fieldErrors: parsed.errors, email: input.email };
  try {
    const { data, error } = await supabase.auth.signUp({
      email: parsed.email,
      password: parsed.password,
    });
    if (error) return { error: authErrorMessage(error), email: parsed.email };
    if (!data.session) {
      // Confirmation d'email activée côté Supabase : pas de session à ce stade.
      return {
        error: "Compte créé, mais la connexion automatique a échoué. Connecte-toi.",
        email: parsed.email,
      };
    }
  } catch {
    return { error: authErrorMessage(null), email: parsed.email };
  }
  return { redirectTo: withNext("/onboarding", input.next) };
}

/** Délai maximal laissé à `signOut` avant d'effacer la session nous-mêmes. */
export const SIGN_OUT_TIMEOUT_MS = 3_000;

/**
 * Déconnexion de CET appareil (`scope: "local"`). Elle doit TOUJOURS
 * aboutir : l'écran recharge ensuite `/login`.
 *
 * `signOut` ne lève pas : en cas d'échec (réseau coupé, serveur Auth en
 * erreur), il renvoie `{ error }` SANS effacer la session. Dans ce cas, ou
 * s'il lève, ou s'il ne répond pas dans `timeoutMs`, les cookies de session
 * (`sb-…-auth-token*`, lisibles en JS depuis CM-88, morceaux compris) sont
 * effacés ici (`sessionCookieNames`, comme après une suppression de compte).
 * Le jeton reste valable côté serveur jusqu'à son expiration, mais cet
 * appareil n'a plus de session : c'est le sens de `scope: "local"`.
 *
 * Renvoie `true` si les cookies ont dû être effacés à la main.
 * `doc` est injectable pour les tests (tests/unit/signupGuard.spec.ts).
 */
export async function signOutLocal(
  supabase: AuthClient,
  doc: { cookie: string } = document,
  timeoutMs: number = SIGN_OUT_TIMEOUT_MS,
): Promise<boolean> {
  let failed = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      supabase.auth.signOut({ scope: "local" }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    failed = result === null || Boolean(result.error);
  } catch {
    failed = true;
  } finally {
    clearTimeout(timer);
  }
  if (failed) {
    for (const name of sessionCookieNames(doc.cookie)) {
      doc.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
    }
  }
  return failed;
}
