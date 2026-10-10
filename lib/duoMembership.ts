import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * CM-86 (correctif C3) : appartenance à un duo, en distinguant « solo » d'une
 * lecture en échec.
 *
 * `getDuoId` (lib/profile.ts) renvoie null aussi bien pour un compte solo que
 * pour une erreur réseau. Pour un simple affichage, c'est sans gravité. Pour
 * décider OÙ écrire (bibliothèque du duo ou bibliothèque perso), une erreur
 * prise pour « solo » rangerait la séance d'Antoine ou de Léa dans une
 * bibliothèque perso, invisible pour l'autre. Toute décision d'écriture passe
 * donc par `readDuoId`, qui refuse de deviner.
 *
 * Aucun import Next : testé dans tests/unit/duoMembership.spec.ts.
 */

export type DuoIdResult =
  | { ok: true; duoId: string | null }
  | { ok: false; error: string };

/** Message affiché quand l'appartenance au duo n'a pas pu être lue. */
export const DUO_READ_ERROR_MESSAGE =
  "Impossible de vérifier ton duo pour l'instant. Réessaie dans un instant.";

/** Résultat d'une lecture `duo_members` (`maybeSingle`) → `DuoIdResult`. */
export function duoIdFromRow(res: {
  data: { duo_id: string | null } | null;
  error: { message: string } | null;
}): DuoIdResult {
  if (res.error) return { ok: false, error: res.error.message || DUO_READ_ERROR_MESSAGE };
  return { ok: true, duoId: res.data?.duo_id ?? null };
}

/**
 * Duo du profil : `{ ok: true, duoId }` (null = solo, avéré) ou
 * `{ ok: false, error }` si la lecture a échoué (erreur ou exception).
 */
export async function readDuoId(
  supabase: SupabaseClient<Database>,
  profileId: string,
): Promise<DuoIdResult> {
  try {
    const res = await supabase
      .from("duo_members")
      .select("duo_id")
      .eq("profile_id", profileId)
      .returns<{ duo_id: string }[]>()
      .maybeSingle();
    return duoIdFromRow({ data: res.data, error: res.error });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : DUO_READ_ERROR_MESSAGE };
  }
}

/** Bibliothèque où ranger une écriture, ou refus si le duo est inconnu. */
export type LibraryTarget =
  | { kind: "shared"; duoId: string }
  | { kind: "personal" }
  | { kind: "error"; error: string };

export function libraryTarget(membership: DuoIdResult): LibraryTarget {
  if (!membership.ok) return { kind: "error", error: DUO_READ_ERROR_MESSAGE };
  return membership.duoId
    ? { kind: "shared", duoId: membership.duoId }
    : { kind: "personal" };
}
