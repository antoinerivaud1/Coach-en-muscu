// CM-89 (PR 2) : adresses des écrans à identifiant, construites ici et nulle
// part ailleurs. L'export statique (Capacitor iOS) n'a pas de route
// dynamique : l'id passe en query (`?id=`), lu dans le navigateur.
// Logique pure, sans import Next : testée dans tests/unit/routes.spec.ts.

/** Écran d'une séance (saisie ou récap), ex-`/sessions/[id]`. */
export const SESSION_VIEW_PATH = "/sessions/view";

/** Éditeur d'une séance type existante, ex-`/seances/[id]/edit`. */
export const SEANCE_EDIT_PATH = "/seances/edit";

export type SessionPathOptions = {
  /** « Modifier » : séance terminée rouverte en saisie (`?edit=1`). */
  edit?: boolean;
  /** « Corriger les séries » depuis le récap (`?editsets=1`). */
  editSets?: boolean;
};

/**
 * `/sessions/view?id=<id>`, plus `&edit=1` ou `&editsets=1`. `edit` l'emporte
 * sur `editSets`, comme à la lecture (SessionScreen) : jamais les deux.
 */
export function sessionPath(id: string, opts: SessionPathOptions = {}): string {
  const base = `${SESSION_VIEW_PATH}?id=${encodeURIComponent(id)}`;
  if (opts.edit) return `${base}&edit=1`;
  if (opts.editSets) return `${base}&editsets=1`;
  return base;
}

/** `/seances/edit?id=<dayId>`. */
export function seanceEditPath(dayId: string): string {
  return `${SEANCE_EDIT_PATH}?id=${encodeURIComponent(dayId)}`;
}
