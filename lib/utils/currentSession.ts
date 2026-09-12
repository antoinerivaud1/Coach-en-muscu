// Logique du bandeau « Reprendre » de l'accueil (CM-83).
//
// Module PUR : aucune I/O, aucun import Supabase. Il ne décide que de ce que
// l'accueil doit proposer pour une séance non terminée, à partir de son âge et
// du nombre de séries déjà écrites — donc testable sans base.
//
// Rappel du modèle (CM-78) : `sessions.duration_seconds` null = séance en cours,
// renseigné = séance terminée. Une séance en cours a des `session_sets` dès la
// première série validée.

/**
 * Passé ce délai, une séance en cours SANS AUCUNE SÉRIE est considérée comme
 * abandonnée : elle ne contient rien, personne ne la reprendra. Elle n'est pas
 * proposée dans le bandeau, et le nettoyage opportuniste de l'accueil la
 * supprime (`purgeAbandonedEmptySessions`).
 */
export const ABANDONED_EMPTY_SESSION_MS = 2 * 60 * 60 * 1000;

/**
 * Passé ce délai, une séance en cours QUI A DES SÉRIES n'est plus une séance
 * qu'on vient d'interrompre : c'est probablement une séance oubliée. On propose
 * toujours de la reprendre, mais aussi de la clôturer ou de la supprimer.
 * Jamais de suppression automatique : elle contient du travail réel.
 */
export const STALE_SESSION_MS = 12 * 60 * 60 * 1000;

/** Une séance en cours, réduite à ce dont la décision a besoin. */
export type CurrentSessionInput = {
  id: string;
  /** Début de la séance, ISO. */
  performedAt: string;
  /** `created_at` de chaque série déjà écrite, ISO, dans n'importe quel ordre. */
  setCreatedAt: string[];
};

export type ResumeBannerState =
  | {
      /** Bandeau affiché. `stale` = clôture et suppression proposées en plus. */
      kind: "banner";
      sessionId: string;
      setCount: number;
      stale: boolean;
    }
  | {
      /** Séance vide et trop ancienne : aucun bandeau, elle est à supprimer. */
      kind: "abandoned";
      sessionId: string;
    }
  | { kind: "none" };

/**
 * Ce que l'accueil doit afficher pour la séance en cours.
 *
 * Choix assumé : une séance vide et RÉCENTE (moins de
 * `ABANDONED_EMPTY_SESSION_MS`) reste proposée en « Reprendre ». Elle vient
 * d'être démarrée, l'utilisateur est peut-être simplement passé par l'accueil
 * entre deux exercices — masquer le bandeau lui ferait croire que sa séance a
 * disparu. La règle des 2 h ne sert qu'à décider de la SUPPRESSION silencieuse.
 *
 * Une date invalide est traitée comme « à l'instant » : jamais comme abandonnée,
 * une séance ne doit pas pouvoir être supprimée sur un âge non calculable.
 */
export function resumeBannerState(
  session: CurrentSessionInput | null,
  now: Date,
): ResumeBannerState {
  if (!session) return { kind: "none" };

  const setCount = session.setCreatedAt.length;
  const startedAt = new Date(session.performedAt).getTime();
  const ageMs = Number.isNaN(startedAt) ? 0 : Math.max(0, now.getTime() - startedAt);

  if (setCount === 0) {
    return ageMs > ABANDONED_EMPTY_SESSION_MS
      ? { kind: "abandoned", sessionId: session.id }
      : { kind: "banner", sessionId: session.id, setCount: 0, stale: false };
  }

  return {
    kind: "banner",
    sessionId: session.id,
    setCount,
    stale: ageMs > STALE_SESSION_MS,
  };
}

/**
 * Durée à écrire en clôturant une séance oubliée : de `performed_at` à la
 * DERNIÈRE série écrite, pas jusqu'à maintenant.
 *
 * Une séance commencée hier soir et clôturée ce matin vaudrait sinon quinze
 * heures, ce qui pollue la durée moyenne et le récap. Renvoie `null` s'il n'y a
 * aucune série ou si les dates sont inexploitables : l'appelant doit alors
 * choisir lui-même quoi écrire, jamais `null` en base — `duration_seconds` null
 * signifie précisément « en cours ».
 *
 * Minimum 1 seconde : une séance dont la seule série a été validée dans la
 * seconde ne doit pas retomber sur 0.
 */
export function closingDurationSeconds(
  performedAt: string,
  setCreatedAt: string[],
): number | null {
  const startedAt = new Date(performedAt).getTime();
  if (Number.isNaN(startedAt)) return null;

  let lastAt = Number.NEGATIVE_INFINITY;
  for (const iso of setCreatedAt) {
    const at = new Date(iso).getTime();
    if (!Number.isNaN(at) && at > lastAt) lastAt = at;
  }
  if (lastAt === Number.NEGATIVE_INFINITY) return null;

  return Math.max(1, Math.round((lastAt - startedAt) / 1000));
}
