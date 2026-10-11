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

  // ---- CM-88 PR 3 : Carnet (historique) et Stats (progression) ----
  // Clé de tête `[profileId, "sessions"]` : une écriture de séance (fin,
  // suppression, édition d'une série) n'aura qu'elle à invalider (PR 6).
  sessions: {
    all: (profileId: string) => [profileId, "sessions"] as const,
    history: (profileId: string) => [profileId, "sessions", "history"] as const,
    /** `requested` : `?profile=` de l'URL tel quel ("" si absent), validé par la lecture. */
    progress: (profileId: string, requested: string) =>
      [profileId, "sessions", "progress", requested] as const,
  },

  // ---- CM-88 PR 4 : accueil ----
  /**
   * Toutes les données de l'accueil (`/dashboard`), en une lecture. Rangée
   * sous `[profileId, "sessions"]` : toute écriture sur les séances (fin,
   * abandon, suppression) qui invalide cette tête relit aussi l'accueil.
   */
  dashboard: {
    all: (profileId: string) => [profileId, "sessions", "dashboard"] as const,
  },
} as const;
