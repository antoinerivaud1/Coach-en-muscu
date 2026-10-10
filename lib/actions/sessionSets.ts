"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId } from "@/lib/profile";
import {
  REFUSED_MESSAGE,
  isRlsDenied,
  touchedRows,
} from "@/lib/supabase/rlsErrors";

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
 *
 * CM-59 B : sauf un refus définitif (`refused: true` : séance pas à toi, refus
 * RLS 42501, ou delete qui ne touche aucune ligne). Le rejouer ne servirait à
 * rien : la file l'abandonne au lieu de boucler.
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; refused?: true };

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
 * CM-59 B : la RLS (client utilisateur) l'empêche aussi ; ce contrôle reste
 * en place (ceinture et bretelles, et filet `DATA_CLIENT=service`). Même
 * logique que `canAccessProgram` (CM-80) : on ne distingue pas « inexistante » de « pas à
 * toi », les deux renvoient « introuvable ».
 */
async function assertOwnsSession(
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string; refused?: true }> {
  if (!sessionId) return { ok: false, error: "Séance introuvable", refused: true };
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
    return { ok: false, error: "Séance introuvable", refused: true };
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

  if (error) {
    return isRlsDenied(error)
      ? { ok: false, error: REFUSED_MESSAGE, refused: true }
      : { ok: false, error: error.message };
  }

  revalidateSession(input.sessionId);
  return { ok: true };
}

export async function deleteSet(input: DeleteSetInput): Promise<ActionResult> {
  if (!input.id) return { ok: false, error: "Série introuvable" };

  const owns = await assertOwnsSession(input.sessionId);
  if (!owns.ok) return owns;

  const supabase = await createClient();
  // CM-59 B : sous RLS, un delete refusé touche 0 ligne sans erreur. La
  // séance est à nous (vérifié ci-dessus) : 0 ligne veut aussi dire « déjà
  // supprimée » (réessai dont la réponse s'est perdue). Dans les deux cas,
  // rejouer ne sert à rien : refus définitif, la file abandonne l'entrée.
  const { data, error } = await supabase
    .from("session_sets")
    .delete()
    .eq("id", input.id)
    .eq("session_id", input.sessionId)
    .select("id");

  if (error) {
    return isRlsDenied(error)
      ? { ok: false, error: REFUSED_MESSAGE, refused: true }
      : { ok: false, error: error.message };
  }
  if (!touchedRows(data)) {
    return { ok: false, error: REFUSED_MESSAGE, refused: true };
  }

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
