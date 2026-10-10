"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfileId } from "@/lib/profile";
import {
  REFUSED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  touchedRows,
  writeErrorMessage,
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
 * CM-59 B :
 * - `refused: true` = refus définitif : séance introuvable ou pas à toi
 *   (contrôle du code), ou delete qui ne touche aucune ligne. La file met
 *   l'opération de côté (`cm:refusedSets:<id>`) au lieu de boucler.
 * - Un 42501 sur l'écriture elle-même reste REJOUABLE : l'appartenance vient
 *   d'être prouvée, c'est donc un jeton parti en anon ou un grant manquant,
 *   pas un vrai refus (et l'avertissement « bloqué » doit s'afficher).
 * - `expired: true` = plus de session : rejouable après reconnexion. Jamais de
 *   redirection vers `/login` ici, elle éjecterait l'utilisateur du logger.
 */

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string; refused?: true; expired?: true };

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
 * logique que `canAccessProgram` (CM-80) : on ne distingue pas « inexistante »
 * de « pas à toi », les deux renvoient « introuvable ».
 */
async function assertOwnsSession(sessionId: string): Promise<ActionResult> {
  if (!sessionId) return { ok: false, error: "Séance introuvable", refused: true };
  const profileId = await getCurrentProfileId();
  if (!profileId) return { ok: false, error: SESSION_EXPIRED_MESSAGE, expired: true };
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

  // 42501 : rejouable (voir l'en-tête), message générique sans détail.
  if (error) return { ok: false, error: writeErrorMessage(error) };

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
  // rejouer ne sert à rien : définitif. Un 42501, lui, reste rejouable.
  const { data, error } = await supabase
    .from("session_sets")
    .delete()
    .eq("id", input.id)
    .eq("session_id", input.sessionId)
    .select("id");

  if (error) return { ok: false, error: writeErrorMessage(error) };
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
