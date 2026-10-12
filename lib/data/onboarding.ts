import type { BrowserSupabase } from "@/lib/supabase/client";
import type { Json } from "@/lib/types/database";
import { findTemplate } from "@/lib/onboardingTemplates";
import { REFUSED_MESSAGE, touchedRows, writeErrorMessage } from "@/lib/supabase/rlsErrors";

/**
 * CM-86 / CM-88 (PR 7) : fin de l'onboarding, depuis le navigateur
 * (remplace les server actions de app/onboarding/actions.ts).
 *
 * Trois sorties, toutes terminent l'onboarding (`onboarded_at = now()`) :
 * - un modèle ajouté (`applyTemplate` : RPC `apply_onboarding_template`,
 *   séances PERSO et `onboarded_at` en UNE transaction, rien à moitié écrit) ;
 * - « Créer ma séance » et « Passer pour l'instant » (`markOnboarded`).
 *
 * CM-89 (PR 1) : le mémo « onboarding fait » de l'appareil (`localStorage`,
 * lu par `OnboardingGate`) est posé par l'écran une fois l'écriture réussie
 * (`rememberOnboarded`, components/onboarding/TemplatePicker.tsx).
 */

export type OnboardingWriteResult = { ok: true } | { ok: false; error: string };

/** Email du compte connecté (claims du JWT), null s'il est illisible. */
export async function fetchAccountEmail(supabase: Pick<BrowserSupabase, "auth">): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const raw = data?.claims?.email;
    return typeof raw === "string" ? raw : null;
  } catch {
    return null;
  }
}

/** Pose `onboarded_at` (une seule fois). */
export async function markOnboarded(
  supabase: BrowserSupabase,
  profileId: string,
): Promise<OnboardingWriteResult> {
  try {
    const { data: current, error: readError } = await supabase
      .from("profiles")
      .select("onboarded_at")
      .eq("id", profileId)
      .returns<{ onboarded_at: string | null }[]>()
      .maybeSingle();
    if (readError) return { ok: false, error: readError.message };
    if (current?.onboarded_at) return { ok: true };

    // CM-59 B : sous RLS, un update refusé touche 0 ligne sans erreur.
    const { data, error } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", profileId)
      .select("id");
    if (error) return { ok: false, error: writeErrorMessage(error) };
    if (!touchedRows(data)) return { ok: false, error: REFUSED_MESSAGE };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Enregistrement impossible" };
  }
}

const TEMPLATE_ERRORS: Record<string, string> = {
  not_authenticated: "Ta session a expiré. Reconnecte-toi.",
  profile_not_found: "Impossible de charger ton profil. Réessaie dans un instant.",
  template_invalid: "Choisis un modèle.",
  template_empty: "Aucun exercice de ce modèle n'est disponible pour l'instant.",
};

/** Erreur de la RPC (`cm88:<code>`) en français ; refus RLS ou autre : message générique. */
export function templateErrorMessage(error: { code?: string | null; message: string }): string {
  const code = /cm88:([a-z_]+)/.exec(error.message)?.[1];
  if (code && TEMPLATE_ERRORS[code]) return TEMPLATE_ERRORS[code];
  const message = writeErrorMessage(error);
  return message === REFUSED_MESSAGE
    ? message
    : "Impossible d'ajouter ce modèle. Vérifie ta connexion puis réessaie.";
}

/**
 * « Ajouter et c'est parti » : les séances du modèle choisi dans ma
 * bibliothèque PERSO, puis fin de l'onboarding, en une transaction.
 * Les exercices sont désignés par leur nom du catalogue système (résolus en
 * base, un nom absent est ignoré).
 */
export async function applyTemplate(
  supabase: BrowserSupabase,
  templateId: string,
): Promise<OnboardingWriteResult> {
  const template = findTemplate(templateId);
  if (!template) return { ok: false, error: "Choisis un modèle." };
  const seances: Json = template.seances.map((s) => ({
    name: s.name,
    exercises: s.exercises.map((e) => ({
      name: e.name,
      sets: e.sets,
      repsMin: e.repsMin,
      repsMax: e.repsMax,
      restSeconds: e.restSeconds,
    })),
  }));
  try {
    const { error } = await supabase.rpc("apply_onboarding_template", { p_seances: seances });
    if (error) return { ok: false, error: templateErrorMessage(error) };
    return { ok: true };
  } catch {
    return { ok: false, error: "Impossible d'ajouter ce modèle. Vérifie ta connexion puis réessaie." };
  }
}
