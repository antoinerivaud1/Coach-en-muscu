"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/profile";
import {
  ONBOARDED_COOKIE,
  ONBOARDED_COOKIE_OPTIONS,
  safeOnboardingExit,
} from "@/lib/onboarding";
import { findTemplate, uniqueSeanceName } from "@/lib/onboardingTemplates";
import { exerciseKey } from "@/lib/exerciseKey";
import {
  ensurePersonalProgram,
  getProgramDayNames,
  nextOrderIndex,
} from "@/lib/queries/programs";
import {
  REFUSED_MESSAGE,
  touchedRows,
  writeErrorMessage,
} from "@/lib/supabase/rlsErrors";

// ─────────────────────────────────────────────────────────────────────────────
// CM-86 : fin de l'onboarding (« Par quoi tu commences ? »).
//
// Trois sorties, toutes terminent l'onboarding (`onboarded_at = now()`) :
// - un modèle ajouté (séances PERSO : programme à mon nom, `duo_id` null) ;
// - « Créer ma séance » (écran existant `/seances/new`) ;
// - « Passer pour l'instant ».
// L'onboarding se termine AVANT d'aller sur `/seances/new` : sinon le
// middleware renverrait aussitôt vers `/onboarding`.
// ─────────────────────────────────────────────────────────────────────────────

export type TemplateFormState = { error?: string };

type Db = SupabaseClient<Database>;

/** Pose `onboarded_at` (une seule fois) et le cookie de confort. */
async function markOnboarded(
  supabase: Db,
  profileId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: current, error: readError } = await supabase
    .from("profiles")
    .select("onboarded_at")
    .eq("id", profileId)
    .returns<{ onboarded_at: string | null }[]>()
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };

  if (!current?.onboarded_at) {
    const { data, error } = await supabase
      .from("profiles")
      .update({ onboarded_at: new Date().toISOString() })
      .eq("id", profileId)
      .select("id");
    if (error) return { ok: false, error: writeErrorMessage(error) };
    if (!touchedRows(data)) return { ok: false, error: REFUSED_MESSAGE };
  }

  const store = await cookies();
  store.set(ONBOARDED_COOKIE, profileId, ONBOARDED_COOKIE_OPTIONS);
  revalidatePath("/", "layout");
  return { ok: true };
}

/** « Passer pour l'instant » ou « Créer ma séance ». */
export async function finishOnboarding(formData: FormData): Promise<void> {
  const exit = safeOnboardingExit(String(formData.get("next") ?? ""));
  const profileId = await getCurrentProfileId();
  if (!profileId) redirect("/login");

  const supabase = await createClient();
  const done = await markOnboarded(supabase, profileId);
  if (!done.ok) {
    redirect(`/onboarding/seances?error=${encodeURIComponent(done.error)}`);
  }
  redirect(exit);
}

/** Exercices système du catalogue, indexés par nom normalisé. */
async function systemExercisesByKey(
  supabase: Db,
  names: string[],
): Promise<{ ok: true; byKey: Map<string, string> } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("exercises")
    .select("id, name")
    .is("duo_id", null)
    .is("owner_profile_id", null)
    .in("name", names)
    .returns<{ id: string; name: string }[]>();
  if (error) return { ok: false, error: error.message };
  const byKey = new Map<string, string>();
  for (const e of data ?? []) byKey.set(exerciseKey(e.name), e.id);
  return { ok: true, byKey };
}

/** Supprime les séances créées par un ajout de modèle interrompu. */
async function rollbackDays(supabase: Db, dayIds: string[]): Promise<void> {
  if (dayIds.length === 0) return;
  await supabase.from("program_days").delete().in("id", dayIds);
}

/** « Ajouter et c'est parti » : ajoute les séances du modèle choisi. */
export async function applyOnboardingTemplate(
  _prev: TemplateFormState,
  formData: FormData,
): Promise<TemplateFormState> {
  const template = findTemplate(String(formData.get("template") ?? ""));
  if (!template) return { error: "Choisis un modèle." };

  const profileId = await getCurrentProfileId();
  if (!profileId) redirect("/login");
  const supabase = await createClient();

  const names = [
    ...new Set(template.seances.flatMap((s) => s.exercises.map((e) => e.name))),
  ];
  const catalog = await systemExercisesByKey(supabase, names);
  if (!catalog.ok) {
    return { error: `Impossible de lire le catalogue (${catalog.error}).` };
  }

  // Toujours la bibliothèque PERSO : un modèle d'onboarding est à moi.
  const library = await ensurePersonalProgram(supabase, profileId);
  if (!library.ok) return { error: library.error };
  const programId = library.programId;

  const siblings = await getProgramDayNames(supabase, programId);
  if (!siblings.ok) {
    return { error: `Impossible de vérifier tes séances (${siblings.error}).` };
  }
  const order = await nextOrderIndex(supabase, programId);
  if (!order.ok) return { error: order.error };

  const taken = siblings.days.map((d) => d.name);
  const created: string[] = [];

  for (const [i, seance] of template.seances.entries()) {
    // Un nom du modèle absent du catalogue est ignoré, pas bloquant.
    const exercises = seance.exercises.flatMap((e) => {
      const id = catalog.byKey.get(exerciseKey(e.name));
      return id ? [{ ...e, id }] : [];
    });
    if (exercises.length === 0) continue;

    const name = uniqueSeanceName(seance.name, taken);
    taken.push(name);

    const { data: day, error: dayError } = await supabase
      .from("program_days")
      .insert({ program_id: programId, name, order_index: order.value + i })
      .select("id")
      .returns<{ id: string }[]>()
      .single();
    if (dayError || !day) {
      await rollbackDays(supabase, created);
      return {
        error: dayError ? writeErrorMessage(dayError) : "Impossible de créer la séance.",
      };
    }
    created.push(day.id);

    const { error: exError } = await supabase.from("program_exercises").insert(
      exercises.map((e, index) => ({
        program_day_id: day.id,
        exercise_id: e.id,
        order_index: index,
        target_sets: e.sets,
        target_reps_min: e.repsMin,
        target_reps_max: e.repsMax,
        rest_seconds: e.restSeconds,
      })),
    );
    if (exError) {
      await rollbackDays(supabase, created);
      return { error: writeErrorMessage(exError) };
    }
  }

  if (created.length === 0) {
    return { error: "Aucun exercice de ce modèle n'est disponible pour l'instant." };
  }

  const done = await markOnboarded(supabase, profileId);
  if (!done.ok) return { error: done.error };

  revalidatePath("/seances");
  revalidatePath("/dashboard");
  redirect("/dashboard");
}
