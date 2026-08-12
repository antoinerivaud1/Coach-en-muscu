"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId } from "@/lib/profile";
import { countLoggedSessionsForDay } from "@/lib/queries/programs";

/**
 * Les actions déclenchées par un `<form action={...}>` ne peuvent pas renvoyer
 * de résultat à l'écran d'origine : elles redirigent. On fait donc voyager le
 * message d'erreur en query string, et la page cible l'affiche (CM-70).
 */
function redirectWithError(path: string, message: string): never {
  const separator = path.includes("?") ? "&" : "?";
  redirect(`${path}${separator}error=${encodeURIComponent(message)}`);
}

export async function startSession(formData: FormData) {
  const dayId = String(formData.get("day_id") ?? "").trim();
  if (!dayId) {
    redirectWithError("/dashboard", "Séance introuvable : impossible de démarrer.");
  }

  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .insert({ profile_id: profileId, program_day_id: dayId })
    .select("id")
    .single();

  if (error || !session) {
    redirectWithError(
      "/dashboard",
      `Impossible de démarrer la séance : ${error?.message ?? "erreur inconnue"}`,
    );
  }

  redirect(`/sessions/${session.id}`);
}

export async function deleteProgram(formData: FormData) {
  const programId = String(formData.get("program_id") ?? "").trim();
  if (!programId) {
    redirectWithError("/dashboard", "Programme introuvable : rien n'a été supprimé.");
  }
  await requireProfileId();
  const supabase = await createClient();

  // CM-70 : l'erreur était totalement ignorée, puis on redirigeait vers le
  // dashboard comme si la suppression avait réussi.
  const { error } = await supabase.from("programs").delete().eq("id", programId);
  if (error) {
    redirectWithError(
      `/programs/${programId}`,
      `Impossible de supprimer le programme : ${error.message}`,
    );
  }

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

/**
 * `order_index` à donner à une nouvelle séance : max existant + 1.
 *
 * CM-70 : l'erreur est remontée. Elle était avalée et la fonction renvoyait
 * `0`, ce qui plaçait la nouvelle séance en doublon d'ordre en tête de liste.
 */
async function nextOrderIndex(
  supabase: Awaited<ReturnType<typeof createClient>>,
  programId: string,
): Promise<{ ok: true; value: number } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .from("program_days")
    .select("order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: false })
    .limit(1)
    .returns<{ order_index: number }[]>();

  if (error) {
    return { ok: false, error: error.message };
  }

  const max = data?.[0]?.order_index;
  return { ok: true, value: typeof max === "number" ? max + 1 : 0 };
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

  const { data: program, error: programError } = await supabase
    .from("programs")
    .select("id")
    .eq("id", input.programId)
    .maybeSingle();
  if (programError) {
    return { success: false, error: programError.message };
  }
  if (!program) {
    return { success: false, error: "Programme introuvable" };
  }

  const order = await nextOrderIndex(supabase, input.programId);
  if (!order.ok) {
    return { success: false, error: order.error };
  }

  const { error } = await supabase.from("program_days").insert({
    program_id: input.programId,
    name,
    order_index: order.value,
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

  const { data: source, error: sourceError } = await supabase
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

  if (sourceError) {
    return { success: false, error: sourceError.message };
  }
  if (!source) {
    return { success: false, error: "Séance introuvable" };
  }

  const order = await nextOrderIndex(supabase, source.program_id);
  if (!order.ok) {
    return { success: false, error: order.error };
  }

  const { data: copy, error: copyError } = await supabase
    .from("program_days")
    .insert({
      program_id: source.program_id,
      name: `${source.name} (copie)`,
      order_index: order.value,
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
      const { error: rollbackError } = await supabase
        .from("program_days")
        .delete()
        .eq("id", copy.id);
      if (rollbackError) {
        return {
          success: false,
          error:
            `${exError.message}. La copie vide « ${source.name} (copie) » n'a pas pu ` +
            `être nettoyée (${rollbackError.message}) : supprime-la à la main.`,
        };
      }
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

  const { data: day, error: dayError } = await supabase
    .from("program_days")
    .select("id, name, program_id")
    .eq("id", dayId)
    .returns<{ id: string; name: string; program_id: string }[]>()
    .maybeSingle();

  if (dayError) {
    return { success: false, error: dayError.message };
  }
  if (!day) {
    return { success: false, error: "Séance introuvable" };
  }

  const logged = await countLoggedSessionsForDay(supabase, dayId);
  // Comptage impossible : on refuse la suppression plutôt que de détacher un
  // historique par défaut (CM-70).
  if (!logged.ok) {
    return {
      success: false,
      error:
        `Impossible de vérifier l'historique de « ${day.name} » (${logged.error}). ` +
        "Suppression annulée par sécurité.",
    };
  }
  if (logged.count > 0) {
    const n = logged.count;
    return {
      success: false,
      error:
        `Impossible de supprimer « ${day.name} » : ${n} séance${n > 1 ? "s" : ""} ` +
        `déjà réalisée${n > 1 ? "s" : ""} y ${n > 1 ? "sont rattachées" : "est rattachée"}. ` +
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

  const { data: day, error: dayError } = await supabase
    .from("program_days")
    .select("id, program_id")
    .eq("id", dayId)
    .returns<{ id: string; program_id: string }[]>()
    .maybeSingle();

  if (dayError) {
    return { success: false, error: dayError.message };
  }
  if (!day) {
    return { success: false, error: "Séance introuvable" };
  }

  const { data: siblings, error: siblingsError } = await supabase
    .from("program_days")
    .select("id, order_index")
    .eq("program_id", day.program_id)
    .order("order_index", { ascending: true })
    .returns<{ id: string; order_index: number }[]>();

  // CM-70 : une erreur ici renvoyait une liste vide, donc `from === -1`, donc
  // `{ success: true }` — un échec complet rapporté comme une réussite.
  if (siblingsError) {
    return { success: false, error: siblingsError.message };
  }

  const ordered = siblings ?? [];
  const from = ordered.findIndex((d) => d.id === dayId);
  if (from === -1) {
    return {
      success: false,
      error: "Séance introuvable dans la bibliothèque : réordonnancement annulé.",
    };
  }

  const to = direction === "up" ? from - 1 : from + 1;
  // Déjà en butée : rien à faire, ce n'est pas une erreur.
  if (to < 0 || to >= ordered.length) {
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

/**
 * Modifie le programme lui-même : son nom et sa portée (individuel / partagé).
 *
 * CM-70 : « Modifier » pointait vers l'assistant 4 étapes de `/programs/new`.
 * Celui-ci gère aussi les séances et, en mode édition, supprime toute séance
 * absente de sa liste puis réécrit les exercices de chaque séance — il pouvait
 * donc détruire le travail fait dans la bibliothèque. Depuis CM-65 les séances
 * appartiennent à la bibliothèque ; l'édition du programme se limite à ses
 * propres champs.
 */
export async function updateProgramMeta(input: {
  programId: string;
  name: string;
  scope: "individual" | "couple";
}): Promise<SeanceActionResult> {
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const name = input.name.trim();
  if (!name) {
    return { success: false, error: "Le nom du programme est obligatoire" };
  }

  const coupleId = await getCoupleId(supabase, profileId);
  if (input.scope === "couple" && !coupleId) {
    return {
      success: false,
      error: "Tu dois être en couple pour partager un programme",
    };
  }

  const { data: program, error: readError } = await supabase
    .from("programs")
    .select("id")
    .eq("id", input.programId)
    .maybeSingle();
  if (readError) {
    return { success: false, error: readError.message };
  }
  if (!program) {
    return { success: false, error: "Programme introuvable" };
  }

  const { error } = await supabase
    .from("programs")
    .update(
      input.scope === "couple"
        ? { name, couple_id: coupleId, owner_profile_id: null }
        : { name, couple_id: null, owner_profile_id: profileId },
    )
    .eq("id", input.programId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidateLibrary(input.programId);
  return { success: true };
}
