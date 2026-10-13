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
  /** CM-90 (PR 4) : `offline` = démarrée sur le téléphone, création en file. */
  | { ok: true; sessionId: string; offline?: true }
  /**
   * CM-90 (PR 2) : `offline` = la requête n'a pas abouti (pas de réseau,
   * coupure). L'appelant peut alors démarrer hors ligne avec le même id.
   */
  | { ok: false; error: string; offline?: true };

/** Erreur sans code : requête qui n'a pas abouti (même règle que sessionWrites). */
function isTransport(error: { code?: string | null } | null | undefined): boolean {
  return !!error && !error.code;
}

/**
 * Démarre une séance à partir d'une séance type (accueil et bibliothèque).
 * Remplace la server action `startSession` (supprimée en PR 5) : mêmes
 * vérifications et mêmes messages. L'appelant navigue vers `sessionPath(<id>)`
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
  /**
   * CM-90 (PR 2) : id créé sur le téléphone. Si la requête se perd et que
   * l'app démarre hors ligne, c'est le MÊME id qui sera rejoué : jamais deux
   * séances pour un seul tap.
   */
  sessionId: string,
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
      return {
        ok: false,
        error: `Impossible de démarrer la séance : ${dayError.message}`,
        ...(isTransport(dayError) ? { offline: true as const } : {}),
      };
    }
    if (!day) {
      return { ok: false, error: `${SEANCE_NOT_FOUND} : impossible de démarrer.` };
    }

    // Contrôle d'accès des séances types (lib/data/seances.ts).
    const access = await checkSeanceAccess(supabase, day.program_id, profileId, "Démarrage annulé.");
    if (!access.ok) return access;

    // Upsert sur l'id : un rejeu (démarrage hors ligne après une réponse
    // perdue) ne crée rien de plus.
    const { error } = await supabase
      .from("sessions")
      .upsert(
        { id: sessionId, profile_id: profileId, program_day_id: dayId },
        { onConflict: "id", ignoreDuplicates: true },
      );

    if (error) {
      return {
        ok: false,
        error: `Impossible de démarrer la séance : ${writeErrorMessage(error)}`,
        ...(isTransport(error) ? { offline: true as const } : {}),
      };
    }
    return { ok: true, sessionId };
  } catch (e) {
    // Réseau coupé : démarrage hors ligne possible (CM-90).
    const message = e instanceof Error ? e.message : "erreur inconnue";
    return { ok: false, error: `Impossible de démarrer la séance : ${message}`, offline: true };
  }
}
