"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId } from "@/lib/profile";

/**
 * Écriture série par série (CM-78).
 *
 * Une série validée part en base tout de suite, seule. L'`id` vient toujours du
 * client (`newSetId()`), jamais de la base : c'est ce qui rend le réessai
 * idempotent, le même `id` rejouant la même ligne au lieu d'en créer une
 * seconde. La migration `session_sets_unique_set` verrouille en plus le triplet
 * `(session_id, exercise_id, set_index)` ; le code ne dépend pas de sa présence.
 *
 * Ces actions ne jettent jamais vers le client : une erreur réseau ou une
 * erreur Postgres revient en `{ ok: false }`, que la file rejoue.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export interface UpsertSetInput {
  id: string;
  sessionId: string;
  exerciseId: string;
  setIndex: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  rpe: number | null;
}

export interface DeleteSetInput {
  id: string;
  sessionId: string;
}

/**
 * Vérifie que la séance appartient au profil courant.
 *
 * Le client serveur utilise la clé `service_role` et contourne donc la RLS
 * (cf. lib/supabase/server.ts) : ce contrôle est la seule chose qui empêche
 * d'écrire dans la séance de quelqu'un d'autre. Même logique que
 * `canAccessProgram` (CM-80) : on ne distingue pas « inexistante » de « pas à
 * toi », les deux renvoient « introuvable ».
 */
async function assertOwnsSession(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!sessionId) return { ok: false, error: "Séance introuvable" };
  const profileId = await requireProfileId();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .select("id, profile_id")
    .eq("id", sessionId)
    .returns<{ id: string; profile_id: string }[]>()
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data || data.profile_id !== profileId) {
    return { ok: false, error: "Séance introuvable" };
  }
  return { ok: true };
}

export async function upsertSet(input: UpsertSetInput): Promise<ActionResult> {
  const reps = Math.round(input.reps);
  const setIndex = Math.round(input.setIndex);
  if (!input.id || !input.exerciseId) {
    return { ok: false, error: "Série incomplète" };
  }
  if (!Number.isFinite(input.weightKg) || input.weightKg < 0) {
    return { ok: false, error: "Poids invalide" };
  }
  if (!Number.isFinite(reps) || reps <= 0) {
    return { ok: false, error: "Répétitions invalides" };
  }
  if (!Number.isFinite(setIndex) || setIndex <= 0) {
    return { ok: false, error: "Numéro de série invalide" };
  }

  const owns = await assertOwnsSession(input.sessionId);
  if (!owns.ok) return owns;

  const supabase = await createClient();
  const { error } = await supabase.from("session_sets").upsert(
    {
      id: input.id,
      session_id: input.sessionId,
      exercise_id: input.exerciseId,
      set_index: setIndex,
      weight_kg: input.weightKg,
      reps,
      is_warmup: input.isWarmup,
      rpe: input.rpe,
    },
    { onConflict: "id" },
  );

  if (error) return { ok: false, error: error.message };

  revalidateSession(input.sessionId);
  return { ok: true };
}

export async function deleteSet(input: DeleteSetInput): Promise<ActionResult> {
  if (!input.id) return { ok: false, error: "Série introuvable" };

  const owns = await assertOwnsSession(input.sessionId);
  if (!owns.ok) return owns;

  const supabase = await createClient();
  const { error } = await supabase
    .from("session_sets")
    .delete()
    .eq("id", input.id)
    .eq("session_id", input.sessionId);

  if (error) return { ok: false, error: error.message };

  revalidateSession(input.sessionId);
  return { ok: true };
}

/**
 * Les séries alimentent la progression et les records : un cache périmé sur
 * `/progress` ferait mentir les stats dès la série suivante.
 */
function revalidateSession(sessionId: string): void {
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/progress");
  revalidatePath("/history");
}
