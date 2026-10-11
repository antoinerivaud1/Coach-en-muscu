// CM-88 : clés du cache TanStack Query, au même endroit pour que lectures et
// écritures parlent des mêmes données. Une écriture invalide la clé de tête
// de ce qu'elle a modifié (ex. `queryKeys.exercises.all(profileId)` après la
// création d'un exercice perso).
//
// Toutes les clés de données commencent par l'id du profil : en cas de
// changement de compte, rien ne peut être servi depuis le cache d'un autre
// (le cache est de toute façon vidé, voir QueryProvider).

export const queryKeys = {
  /** Session courante (id du profil connecté). */
  auth: () => ["auth"] as const,

  exercises: {
    all: (profileId: string) => [profileId, "exercises"] as const,
    catalog: (profileId: string) => [profileId, "exercises", "catalog"] as const,
  },

  // ---- CM-88 PR 2 : Profil ---------------------------------------------------
  /** Toutes les données d'un profil : à invalider après un changement d'identité ou de duo. */
  all: (profileId: string) => [profileId] as const,
  profile: {
    identity: (profileId: string) => [profileId, "profile", "identity"] as const,
    badges: (profileId: string, weeklyGoal: number) =>
      [profileId, "profile", "badges", weeklyGoal] as const,
  },
  duo: {
    state: (profileId: string) => [profileId, "duo", "state"] as const,
  },
  // ---- fin CM-88 PR 2 ----------------------------------------------------------
} as const;
