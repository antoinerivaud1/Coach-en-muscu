import type { BrowserSupabase } from "@/lib/supabase/client";
import { getMemberProfiles, type Profile } from "@/lib/queries/profiles";
import { getHistory, type HistorySessionRow } from "@/lib/queries/sessions";

/**
 * CM-88 : lectures des séances côté client (Carnet). Convention `lib/data/*` :
 * client navigateur en premier paramètre, mêmes requêtes que les pages
 * serveur (`lib/queries/*`), une lecture en échec LÈVE (l'écran affiche
 * `ScreenError` au lieu d'un faux « Aucune séance »).
 */

export type HistoryData = {
  /** Moi, plus mon partenaire en duo actif (affichage seulement). */
  profiles: Profile[];
  /** Séances TERMINÉES (CM-83) et non vides, de la plus récente à la plus ancienne. */
  sessions: HistorySessionRow[];
};

export async function fetchHistory(
  supabase: BrowserSupabase,
  profileId: string,
): Promise<HistoryData> {
  // CM-87 : prénom et couleur de chacun ; en cas d'erreur sur le duo, moi
  // seul (aucune comparaison), comme la page serveur.
  const { profiles } = await getMemberProfiles(supabase, profileId);
  const ids = profiles.some((p) => p.id === profileId)
    ? profiles.map((p) => p.id)
    : [profileId, ...profiles.map((p) => p.id)];

  // `getHistory` ne renvoie que des séances TERMINÉES (CM-83) : une séance en
  // cours n'apparaît donc pas ici avec un compteur de séries qui bouge. Le
  // filtre restant écarte les séances terminées à vide, qui n'ont rien à
  // montrer.
  const { data, error } = await getHistory(supabase, ids);
  if (error) throw new Error("Impossible de charger l'historique.");
  return {
    profiles,
    sessions: (data ?? []).filter((s) => s.session_sets.length > 0),
  };
}
