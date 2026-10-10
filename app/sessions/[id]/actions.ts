"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCurrentProfileId } from "@/lib/profile";
import { getLastSetsByExercise } from "@/lib/queries/sessions";
import type { LastExerciseData } from "@/lib/queries/sessions";
import { closingDurationSeconds } from "@/lib/utils/currentSession";
import {
  REFUSED_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  touchedRows,
  writeErrorMessage,
} from "@/lib/supabase/rlsErrors";
import type { Database } from "@/lib/types/database";

type Feedback = Database["public"]["Enums"]["session_feedback"];

export type LoggedSet = {
  exercise_id: string;
  set_index: number;
  weight_kg: number;
  reps: number;
  is_warmup: boolean;
};

export type FinishSessionInput = {
  sessionId: string;
  feedback: Feedback | null;
  durationSeconds: number | null;
  notes?: string | null;
  /**
   * Rattrapage des séances mises de côté par l'ancienne version (CM-18) : leur
   * lot de séries n'a jamais été écrit, il vit encore dans `localStorage`.
   * Depuis CM-78 le client n'envoie plus jamais ce champ, les séries partent
   * une par une au moment de leur validation.
   */
  sets?: LoggedSet[];
};

export type FinishSessionResult =
  | { ok: true }
  /**
   * CM-59 B :
   * - `refused` : refus définitif (séance introuvable ou pas à toi, ou update à
   *   0 ligne). La file `cm_pending_sessions` met l'entrée de côté
   *   (`cm_refused_sessions`) au lieu de la rejouer en boucle.
   * - `expired` : plus de session, rejouable après reconnexion.
   * - Un 42501 reste rejouable : l'appartenance vient d'être prouvée, c'est un
   *   jeton parti en anon ou un grant manquant, pas un vrai refus.
   */
  | { ok: false; error: string; refused?: true; expired?: true };

/**
 * Clôture d'une séance (CM-78).
 *
 * N'écrit plus aucune série : elles sont déjà en base, écrites une par une à
 * leur validation (`lib/actions/sessionSets.ts`). Cette action ne fait que
 * marquer la séance terminée — `duration_seconds` non nul est précisément ce
 * qui distingue une séance terminée d'une séance en cours.
 */
export async function finishSession(
  input: FinishSessionInput,
): Promise<FinishSessionResult> {
  // CM-59 B : pas de `requireProfileId()` (sa redirection vers /login
  // éjecterait l'utilisateur du logger) : « Session expirée », rejouable.
  const profileId = await getCurrentProfileId();
  if (!profileId) return { ok: false, error: SESSION_EXPIRED_MESSAGE, expired: true };
  const supabase = await createClient();

  // Vérifie que la séance appartient bien au profil courant.
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, profile_id")
    .eq("id", input.sessionId)
    .returns<{ id: string; profile_id: string }[]>()
    .maybeSingle();

  if (sessionError) {
    return { ok: false, error: sessionError.message };
  }
  if (!session || session.profile_id !== profileId) {
    return { ok: false, error: "Séance introuvable", refused: true };
  }

  const legacySets = (input.sets ?? []).filter(
    (s) => s.reps > 0 && s.weight_kg >= 0 && Number.isFinite(s.weight_kg),
  );
  if (legacySets.length > 0) {
    // Une séance en attente d'avant CM-78 : on n'insère que si la séance est
    // encore vide, pour ne jamais dupliquer des séries déjà écrites par la file.
    const { count } = await supabase
      .from("session_sets")
      .select("id", { count: "exact", head: true })
      .eq("session_id", input.sessionId);

    if ((count ?? 0) === 0) {
      const { error: insertError } = await supabase.from("session_sets").insert(
        legacySets.map((s) => ({
          session_id: input.sessionId,
          exercise_id: s.exercise_id,
          set_index: s.set_index,
          weight_kg: s.weight_kg,
          reps: s.reps,
          is_warmup: s.is_warmup,
        })),
      );
      if (insertError) {
        return { ok: false, error: writeErrorMessage(insertError) };
      }
    }
  }

  // CM-59 B : sous RLS, un update refusé touche 0 ligne sans erreur.
  const { data: updated, error: updateError } = await supabase
    .from("sessions")
    .update({
      feedback: input.feedback,
      duration_seconds: input.durationSeconds,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
    })
    .eq("id", input.sessionId)
    .select("id");

  if (updateError) {
    return { ok: false, error: writeErrorMessage(updateError) };
  }
  if (!touchedRows(updated)) {
    return { ok: false, error: REFUSED_MESSAGE, refused: true };
  }

  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/progress");
  revalidatePath(`/sessions/${input.sessionId}`);
  return { ok: true };
}

/**
 * « Dernière fois » d'un exercice ajouté en cours de séance (CM-62).
 *
 * Même logique que le chargement serveur de la séance, sur un seul exercice :
 * l'exercice n'étant pas au programme, son historique n'a pas pu être chargé
 * au rendu initial. Passe par le serveur, donc aucune requête Supabase côté
 * client.
 */
export async function fetchLastForExercise(
  exerciseId: string,
  excludeSessionId: string,
): Promise<LastExerciseData | null> {
  // Appelée par le logger : pas de redirection (CM-59 B), rien sans session.
  const profileId = await getCurrentProfileId();
  if (!profileId) return null;
  const supabase = await createClient();
  const byExercise = await getLastSetsByExercise(
    supabase,
    profileId,
    [exerciseId],
    excludeSessionId,
  );
  return byExercise[exerciseId] ?? null;
}

export async function deleteSession(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const profileId = await getCurrentProfileId();
  const supabase = await createClient();
  if (!profileId || !sessionId) return;

  // CM-59 B : sous RLS, un delete refusé touche 0 ligne sans erreur.
  const { data: deleted, error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("profile_id", profileId)
    .select("id");
  if (error) backToDashboard(`Impossible de supprimer la séance : ${writeErrorMessage(error)}`);
  if (!touchedRows(deleted)) backToDashboard("Séance introuvable.");

  revalidatePath("/history");
  revalidatePath("/progress");
  redirect("/history");
}

export async function updateSet(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "").trim();
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const weight = Number(String(formData.get("weight") ?? "0").replace(",", "."));
  const reps = parseInt(String(formData.get("reps") ?? "0"), 10);
  const profileId = await getCurrentProfileId();
  const supabase = await createClient();
  if (profileId && setId && Number.isFinite(weight) && Number.isFinite(reps) && reps > 0) {
    // CM-59 B : contrôle d'appartenance en code, en plus de la RLS, pour que
    // le filet `DATA_CLIENT=service` n'ouvre pas les séries d'un autre compte.
    await assertRecapSessionOwned(supabase, sessionId, profileId);
    // Sous RLS, un update refusé touche 0 ligne sans erreur.
    const { data: updated, error } = await supabase
      .from("session_sets")
      .update({ weight_kg: weight, reps })
      .eq("id", setId)
      .eq("session_id", sessionId)
      .select("id");
    if (error) backToDashboard(`Série non modifiée : ${writeErrorMessage(error)}`);
    if (!touchedRows(updated)) backToDashboard("Série introuvable.");
  }
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/progress");
  redirect(`/sessions/${sessionId}?editsets=1`);
}

export async function deleteSet(formData: FormData) {
  const setId = String(formData.get("set_id") ?? "").trim();
  const sessionId = String(formData.get("session_id") ?? "").trim();
  const profileId = await getCurrentProfileId();
  const supabase = await createClient();
  if (profileId && setId) {
    // CM-59 B : contrôle d'appartenance en code (filet `DATA_CLIENT=service`).
    await assertRecapSessionOwned(supabase, sessionId, profileId);
    // Sous RLS, un delete refusé touche 0 ligne sans erreur.
    const { data: deleted, error } = await supabase
      .from("session_sets")
      .delete()
      .eq("id", setId)
      .eq("session_id", sessionId)
      .select("id");
    if (error) backToDashboard(`Série non supprimée : ${writeErrorMessage(error)}`);
    if (!touchedRows(deleted)) backToDashboard("Série introuvable.");
  }
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/progress");
  redirect(`/sessions/${sessionId}?editsets=1`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Séance en cours : clôture différée et abandon depuis l'accueil (CM-83)
//
// Les deux actions sont déclenchées par un `<form action={…}>` du bandeau de
// reprise : elles reçoivent donc un `FormData` et redirigent, le message
// d'erreur voyageant en query string comme pour `startSession` (CM-70).
//
// La RLS laisse LIRE les séances du partenaire de duo (CM-59). Chaque action
// vérifie donc elle-même l'appartenance de la séance au profil courant, et
// refuse par « introuvable » sans distinguer le cas « pas à toi » du cas
// « n'existe pas » (même logique que CM-78 / CM-82).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Formulaires du récap (`updateSet`, `deleteSet`) : la séance doit être celle
 * du profil courant, sinon retour à l'accueil avec « Séance introuvable. »
 * (même message qu'une séance inexistante).
 */
async function assertRecapSessionOwned(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  profileId: string,
): Promise<void> {
  if (!sessionId) backToDashboard("Séance introuvable.");
  const { data, error } = await supabase
    .from("sessions")
    .select("id, profile_id")
    .eq("id", sessionId)
    .returns<{ id: string; profile_id: string }[]>()
    .maybeSingle();
  if (error) backToDashboard(`Série non modifiée : ${writeErrorMessage(error)}`);
  if (!data || data.profile_id !== profileId) backToDashboard("Séance introuvable.");
}

function backToDashboard(message?: string): never {
  redirect(
    message ? `/dashboard?error=${encodeURIComponent(message)}` : "/dashboard",
  );
}

/**
 * Clôture une séance oubliée sans la rouvrir.
 *
 * Passe par `finishSession`, exactement comme « Terminer la séance » du logger
 * (fin de parcours ou feuille de sortie, CM-94) : un seul chemin marque une séance terminée. La durée est calculée
 * de `performed_at` jusqu'à la DERNIÈRE série écrite, pas jusqu'à maintenant —
 * une séance d'hier soir clôturée ce matin ne doit pas valoir quinze heures.
 */
export async function closeStaleSession(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "").trim();
  if (!sessionId) backToDashboard("Séance introuvable.");

  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, profile_id, performed_at, duration_seconds")
    .eq("id", sessionId)
    .returns<
      {
        id: string;
        profile_id: string;
        performed_at: string;
        duration_seconds: number | null;
      }[]
    >()
    .maybeSingle();

  if (error) backToDashboard(`Impossible de terminer la séance : ${error.message}`);
  if (!session || session.profile_id !== profileId) {
    backToDashboard("Séance introuvable.");
  }
  // Déjà terminée (deux onglets, double tap) : rien à faire, et surtout pas
  // écraser la durée réelle par une durée recalculée.
  if (session.duration_seconds !== null) backToDashboard();

  const { data: sets } = await supabase
    .from("session_sets")
    .select("created_at")
    .eq("session_id", sessionId)
    .returns<{ created_at: string }[]>();

  const duration = closingDurationSeconds(
    session.performed_at,
    (sets ?? []).map((s) => s.created_at),
  );
  if (duration === null) {
    // Aucune série exploitable : ce n'est pas une séance à clôturer, le bandeau
    // ne propose « Terminer » que pour une séance qui en a.
    backToDashboard("Cette séance n'a aucune série à enregistrer.");
  }

  const result = await finishSession({
    sessionId,
    feedback: null,
    durationSeconds: duration,
  });
  if (!result.ok) {
    backToDashboard(`Impossible de terminer la séance : ${result.error}`);
  }

  backToDashboard();
}

/**
 * Supprime une séance et ses séries depuis l'accueil.
 *
 * Distincte de `deleteSession`, qui sert le récap et redirige vers
 * l'historique : ici on revient à l'accueil, où le bandeau doit avoir disparu.
 * Les séries sont supprimées explicitement, sans dépendre du `ON DELETE` de la
 * clé étrangère.
 */
export async function discardSession(formData: FormData) {
  const sessionId = String(formData.get("session_id") ?? "").trim();
  if (!sessionId) backToDashboard("Séance introuvable.");

  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, profile_id")
    .eq("id", sessionId)
    .returns<{ id: string; profile_id: string }[]>()
    .maybeSingle();

  if (error) backToDashboard(`Impossible de supprimer la séance : ${error.message}`);
  if (!session || session.profile_id !== profileId) {
    backToDashboard("Séance introuvable.");
  }

  const { error: setsError } = await supabase
    .from("session_sets")
    .delete()
    .eq("session_id", sessionId);
  // 0 ligne ici n'est PAS un refus : une séance peut n'avoir aucune série.
  // L'appartenance est vérifiée juste au-dessus, et le delete de la séance
  // ci-dessous, lui, doit toucher une ligne.
  if (setsError) {
    backToDashboard(`Impossible de supprimer la séance : ${writeErrorMessage(setsError)}`);
  }

  const { data: deleted, error: deleteError } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .eq("profile_id", profileId)
    .select("id");
  if (deleteError) {
    backToDashboard(`Impossible de supprimer la séance : ${writeErrorMessage(deleteError)}`);
  }
  if (!touchedRows(deleted)) backToDashboard("Séance introuvable.");

  revalidatePath("/dashboard");
  revalidatePath("/history");
  revalidatePath("/progress");
  backToDashboard();
}
