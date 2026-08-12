"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId } from "@/lib/profile";
import { countLoggedSessionsForDay } from "@/lib/queries/programs";

export async function startSession(formData: FormData) {
  const dayId = String(formData.get("day_id") ?? "").trim();
  if (!dayId) {
    redirect("/dashboard");
  }

  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ profile_id: profileId, program_day_id: dayId })
    .select("id")
    .single();

  if (error || !session) {
    redirect(`/dashboard?error=${encodeURIComponent(error?.message ?? "Erreur")}`);
  }

  redirect(`/sessions/${session.id}`);
}

export async function deleteProgram(formData: FormData) {
  const programId = String(formData.get("program_id") ?? "").trim();
  if (!programId) {
    redirect("/dashboard");
  }
  await requireProfileId();
  const supabase = await createClient();

  await supabase.from("programs").delete().eq("id", programId);

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

// ─────────────────────────────────────────────────────────────────────────────
// Bibliothèque de séances types (CM-65)
//
// Rappel schéma : une séance type = une ligne de `program_days`. Le nom des
// tables et colonnes est inchangé, seul le vocabulaire de l'UI parle de
// « séance ».
// ─────────────────────────────────────────────────────────────────────────────

export type SeanceActionResult =
  | { success: true }
  | { success: false; error: string };

function revalidateLibrary(programId: string) {
  revalidatePath(`/programs/${programId}`);
  revalidatePath("/dashboard");
}

/** `order_index` à donner à une nouvelle séance : max existant + 1. */
async function nextOrderIndex(
  supabase: Awaited<ReturnType<typeof createClient>>,
  programId: string,
): Promise<number> {
  const { data } = await supabase
    .from("program_days")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1)
    .returns<{ order_index: number }[]>();

  const max = data?.[0]?.order_index;
  return typeof max === "number" ? max + 1 : 0;
}

export async function createSeance(input: {
  programId: string;
  name: string;
}): Promise<SeanceActionResult> {
  await requireProfileId();
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) {
    return { success: false, error: "Le nom de la séance est obligatoire" };
  }

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("id", input.programId)
    .maybeSingle();
  if (!program) {
    return { success: false, error: "Programme introuvable" };
  }

  const { error } = await supabase.from("program_days").insert({
    program_id: input.programId,
    name,
    order_index: await nextOrderIndex(supabase, input.programId),
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateLibrary(input.programId);
  return { success: true };
}

/**
 * Duplique une séance et TOUS ses exercices (séries, reps, repos, ordre).
 * La copie est ajoutée en fin de bibliothèque.
 */
export async function duplicateSeance(
  dayId: string,
): Promise<SeanceActionResult> {
  await requireProfileId();
  const supabase = await createClient();

  const { data: source } = await supabase
    .from("program_days")
    .select(
      `id, name, program_id,
       program_exercises (
         exercise_id, target_sets, target_reps_min, target_reps_max,
         rest_seconds, order_index
       )`,
    )
    .eq("id", dayId)
    .returns<
      {
        id: string;
        name: string;
        program_id: string;
        program_exercises: {
          exercise_id: string;
          target_sets: number;
          target_reps_min: number;
          target_reps_max: number;
          rest_seconds: number;
          order_index: number;
        }[];
      }[]
    >()
    .maybeSingle();

  if (!source) {
    return { success: false, error: "Séance introuvable" };
  }

  const { data: copy, error: copyError } = await supabase
    .from("program_days")
    .insert({
      program_id: source.program_id,
      name: `${source.name} (copie)`,
      order_index: await nextOrderIndex(supabase, source.program_id),
    })
    .select("id")
    .single();

  if (copyError || !copy) {
    return {
      success: false,
      error: copyError?.message ?? "Erreur lors de la duplication",
    };
  }

  const exercises = source.program_exercises ?? [];
  if (exercises.length > 0) {
    const { error: exError } = await supabase.from("program_exercises").insert(
      exercises.map((pe) => ({
        program_day_id: copy.id,
        exercise_id: pe.exercise_id,
        target_sets: pe.target_sets,
        target_reps_min: pe.target_reps_min,
        target_reps_max: pe.target_reps_max,
        rest_seconds: pe.rest_seconds,
        order_index: pe.order_index,
      })),
    );

    if (exError) {
      // La copie serait vide et donc inutilisable : on annule tout.
      await supabase.from("program_days").delete().eq("id", copy.id);
      return { success: false, error: exError.message };
    }
  }

  revalidateLibrary(source.program_id);
  return { success: true };
}

/**
 * Supprime une séance type.
 *
 * `sessions.program_day_id` est en ON DELETE SET NULL : supprimer une séance
 * déjà réalisée ne supprimerait pas l'historique mais le détacherait en
 * silence (les séances passées perdraient leur nom). On bloque donc la
 * suppression dès qu'au moins une séance a réellement été loggée dessus.
 * Les sessions vides (aucune série enregistrée) ne bloquent pas.
 */
export async function deleteSeance(dayId: string): Promise<SeanceActionResult> {
  await requireProfileId();
  const supabase = await createClient();

  const { data: day } = await supabase
    .from("program_days")
    .select("id, name, program_id")
    .eq("id", dayId)
    .returns<{ id: string; name: string; program_id: string }[]>()
    .maybeSingle();

  if (!day) {
    return { success: false, error: "Séance introuvable" };
  }

  const logged = await countLoggedSessionsForDay(supabase, dayId);
  if (logged > 0) {
    return {
      success: false,
      error:
        `Impossible de supprimer « ${day.name} » : ${logged} séance${logged > 1 ? "s" : ""} ` +
        `déjà réalisée${logged > 1 ? "s" : ""} y ${logged > 1 ? "sont rattachées" : "est rattachée"}. ` +
        "La supprimer détacherait cet historique. Renomme-la ou vide-la de ses exercices.",
    };
  }

  const { error } = await supabase
    .from("program_days")
    .delete()
    .eq("id", dayId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateLibrary(day.program_id);
  return { success: true };
}

/**
 * Monte ou descend une séance dans la bibliothèque.
 *
 * Pas de drag and drop : deux boutons monter / descendre, fiables au doigt sur
 * iOS. Les `order_index` de toute la bibliothèque sont réécrits en 0..n-1, ce
 * qui rattrape au passage d'éventuels trous ou doublons.
 */
export async function moveSeance(
  dayId: string,
  direction: "up" | "down",
): Promise<SeanceActionResult> {
  await requireProfileId();
  const supabase = await createClient();

  const { data: day } = await supabase
    .from("program_days")
    .select("id, program_id")
    .eq("id", dayId)
    .returns<{ id: string; program_id: string }[]>()
    .maybeSingle();

  if (!day) {
    return { success: false, error: "Séance introuvable" };
  }

  const { data: siblings } = await supabase
    .from("program_days")
    .select("id, order_index")
    .eq("program_id", day.program_id)
    .order("order_index", { ascending: true })
    .returns<{ id: string; order_index: number }[]>();

  const ordered = siblings ?? [];
  const from = ordered.findIndex((d) => d.id === dayId);
  const to = direction === "up" ? from - 1 : from + 1;
  if (from === -1 || to < 0 || to >= ordered.length) {
    return { success: true };
  }

  const reordered = [...ordered];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved!);

  for (let i = 0; i < reordered.length; i++) {
    const current = reordered[i]!;
    if (current.order_index === i) continue;
    const { error } = await supabase
      .from("program_days")
      .update({ order_index: i })
      .eq("id", current.id);
    if (error) {
      return { success: false, error: error.message };
    }
  }

  revalidateLibrary(day.program_id);
  return { success: true };
}
