import type { BrowserSupabase } from "@/lib/supabase/client";
import { writeErrorMessage } from "@/lib/supabase/rlsErrors";
import { SEANCE_NOT_FOUND, checkSeanceAccess } from "@/lib/data/seances";

/**
 * CM-88 : écritures des séances côté client.
 *
 * Convention de ce fichier : une écriture ne lève jamais, elle renvoie
 * `{ ok: true, … } | { ok: false, error }` avec un message en français prêt à
 * être affiché (même texte que les server actions qu'elle remplace).
 */

export type StartSessionResult =
  | { ok: true; sessionId: string }
  | { ok: false; error: string };

/**
 * Démarre une séance à partir d'une séance type (accueil et bibliothèque).
 * Remplace la server action `startSession` (supprimée en PR 5) : mêmes
 * vérifications et mêmes messages. L'appelant navigue vers `/sessions/<id>`
 * en cas de succès, ou vers `/dashboard?error=…` sinon.
 *
 * La RLS (CM-59 B) refuse déjà de démarrer la séance type d'un autre duo ; le
 * contrôle d'accès reste en place (ceinture et bretelles), et refuse l'action
 * quand il ne peut pas aboutir, jamais l'autorise par défaut.
 */
export async function startSessionFromDay(
  supabase: BrowserSupabase,
  profileId: string,
  rawDayId: string,
): Promise<StartSessionResult> {
  const dayId = rawDayId.trim();
  if (!dayId) {
    return { ok: false, error: "Séance introuvable : impossible de démarrer." };
  }

  try {
    const { data: day, error: dayError } = await supabase
      .from("program_days")
      .select("id, program_id")
      .eq("id", dayId)
      .returns<{ id: string; program_id: string }[]>()
      .maybeSingle();

    if (dayError) {
      return { ok: false, error: `Impossible de démarrer la séance : ${dayError.message}` };
    }
    if (!day) {
      return { ok: false, error: `${SEANCE_NOT_FOUND} : impossible de démarrer.` };
    }

    // Contrôle d'accès commun à la suppression (lib/data/seances.ts).
    const access = await checkSeanceAccess(supabase, day.program_id, profileId, "Démarrage annulé.");
    if (!access.ok) return access;

    const { data: session, error } = await supabase
      .from("sessions")
      .insert({ profile_id: profileId, program_day_id: dayId })
      .select("id")
      .single();

    if (error || !session) {
      return {
        ok: false,
        error: `Impossible de démarrer la séance : ${error ? writeErrorMessage(error) : "erreur inconnue"}`,
      };
    }
    return { ok: true, sessionId: session.id };
  } catch (e) {
    // Réseau coupé : la server action aurait échoué de la même façon.
    const message = e instanceof Error ? e.message : "erreur inconnue";
    return { ok: false, error: `Impossible de démarrer la séance : ${message}` };
  }
}
