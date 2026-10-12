import type { BrowserSupabase } from "@/lib/supabase/client";
import { getProfile, readDuoMembership, type Profile } from "@/lib/queries/profiles";
import {
  buildLastDoneByDay,
  getAllSetsForProgress,
  getCompletedSessionsForDashboard,
  getCurrentSession,
  getDoneSessions,
  purgeAbandonedEmptySessions,
  type CurrentSessionRow,
  type DashboardSessionRow,
  type DoneSessionRow,
  type ProgressRow,
} from "@/lib/queries/sessions";
import { resumeBannerState, type ResumeBannerState } from "@/lib/utils/currentSession";
import { formatRecord, latestRecord, toMembers, type Member } from "@/lib/duo";
import type { MemberWeek } from "@/components/duo/DuoWeekCard";
import { memberAccent } from "@/lib/members";
import { estimateSeanceMinutes } from "@/lib/onboardingTemplates";
import { countSets, type MuscleGroup } from "@/lib/utils/seances";
import {
  APP_TIME_ZONE,
  formatLastDone,
  localDayNumber,
  localWeekdayIndex,
  muscleRecency,
  pickRecommendedSeance,
  sortByStaleness,
  type SeanceCard,
  type SessionHistoryEntry,
} from "@/lib/utils/recommendation";

/**
 * CM-88 (PR 4) : données de l'accueil (`/dashboard`), lues dans le navigateur
 * sous RLS. Deux temps :
 * - `fetchDashboard` : les LECTURES, mêmes requêtes que l'ancienne page
 *   serveur (une lecture essentielle en échec lève, l'écran propose
 *   « Réessayer ») ;
 * - `buildDashboardView` : le calcul PUR de ce qui s'affiche (strip hebdo,
 *   suggestion, bandeau de reprise, duo, accueil du premier jour), refait à
 *   chaque rendu avec l'heure courante, testé dans tests/unit/dashboardView.spec.ts.
 */

/** Une séance type de la bibliothèque telle que l'accueil la lit. */
export type DashboardProgramRow = {
  id: string;
  name: string;
  duo_id: string | null;
  program_days: {
    id: string;
    name: string;
    order_index: number;
    program_exercises: {
      target_sets: number;
      rest_seconds: number;
      exercises: { muscle_group: MuscleGroup } | null;
    }[];
  }[];
};

export type DashboardData = {
  profile: Profile | null;
  /**
   * La lecture du duo a abouti. En échec, ni sections duo ni accueil du
   * premier jour (CM-86, C3 : une erreur n'est jamais prise pour « solo »).
   */
  membershipOk: boolean;
  duoId: string | null;
  /** Profil du partenaire de duo ACTIF, null en solo ou s'il est illisible. */
  partner: Profile | null;
  /** Séance du partenaire en cours en ce moment (CM-53). */
  partnerLive: { dayName: string } | null;
  /** Séance en cours du profil (bandeau de reprise, CM-83). */
  currentSession: CurrentSessionRow | null;
  /**
   * Séances TERMINÉES récentes du profil (fenêtre `RECENT_WINDOW_DAYS`), du
   * plus récent au plus ancien, avec leurs séries (strip, muscles récents).
   */
  sessions: DashboardSessionRow[];
  /**
   * CM-89 (PR 0) : toutes les séances terminées non vides, en version légère
   * (« dernière fois » par séance type, nombre de séances).
   */
  doneSessions: DoneSessionRow[];
  programs: DashboardProgramRow[];
  /** Séances terminées récentes du partenaire (duo actif seulement). */
  partnerSessions: DashboardSessionRow[];
  /** Séries du partenaire (dernier record battu, duo actif seulement). */
  partnerSets: ProgressRow[];
  /** Noms des exercices de ces séries qui me sont visibles, par id. */
  exerciseNames: Record<string, string>;
};

/** Séance « en cours » du partenaire : pas terminée et commencée il y a moins de 3 h. */
const PARTNER_LIVE_MS = 3 * 3600 * 1000;

async function fetchPartnerLive(
  supabase: BrowserSupabase,
  partnerId: string,
): Promise<{ dayName: string } | null> {
  const since = new Date(Date.now() - PARTNER_LIVE_MS).toISOString();
  const { data: live } = await supabase
    .from("sessions")
    .select("id, program_days(name)")
    .eq("profile_id", partnerId)
    .is("duration_seconds", null)
    .gte("performed_at", since)
    .order("performed_at", { ascending: false })
    .limit(1)
    .returns<{ id: string; program_days: { name: string } | null }[]>();
  const row = live?.[0];
  return row ? { dayName: row.program_days?.name ?? "une séance" } : null;
}

/**
 * Bibliothèque de séances types. Les programmes partagés ont
 * `owner_profile_id` à null et ne remontent que par la branche `duo_id` du
 * `or(...)`.
 */
async function fetchPrograms(
  supabase: BrowserSupabase,
  profileId: string,
  duoId: string | null,
): Promise<DashboardProgramRow[]> {
  let q = supabase
    .from("programs")
    .select(
      "id, name, duo_id, owner_profile_id, created_at, program_days(id, name, order_index, program_exercises(target_sets, rest_seconds, exercises(muscle_group)))",
    )
    .order("created_at", { ascending: true });
  q = duoId
    ? q.or(`owner_profile_id.eq.${profileId},duo_id.eq.${duoId}`)
    : q.eq("owner_profile_id", profileId);
  const { data, error } = await q.returns<DashboardProgramRow[]>();
  if (error) throw new Error(`Impossible de charger tes séances : ${error.message}`);
  return data ?? [];
}

/** Noms des exercices visibles parmi `ids` (la RLS masque les autres). */
async function fetchExerciseNames(
  supabase: BrowserSupabase,
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabase
    .from("exercises")
    .select("id, name")
    .in("id", ids)
    .returns<{ id: string; name: string }[]>();
  return Object.fromEntries((data ?? []).map((e) => [e.id, e.name]));
}

/**
 * CM-89 (PR 0) : fenêtre des séances lues en détail (séries comprises). Elle
 * couvre la semaine en cours (au plus 7 jours en arrière, lundi compris) et
 * les muscles sollicités sur `BALANCE_WINDOW_DAYS` (7 jours), plus un jour
 * de marge pour les fuseaux.
 */
export const RECENT_WINDOW_DAYS = 8;

/** Toutes les lectures de l'accueil. */
export async function fetchDashboard(
  supabase: BrowserSupabase,
  profileId: string,
): Promise<DashboardData> {
  const since = new Date(Date.now() - RECENT_WINDOW_DAYS * 86400000).toISOString();
  const [profile, membershipRead, currentSession, sessionsRes, doneRes] = await Promise.all([
    getProfile(supabase, profileId),
    readDuoMembership(supabase, profileId),
    getCurrentSession(supabase, profileId),
    getCompletedSessionsForDashboard(supabase, profileId, since),
    getDoneSessions(supabase, profileId),
  ]);
  const readError = sessionsRes.error ?? doneRes.error;
  if (readError) {
    // Jamais de liste vide par défaut : elle ferait passer pour un premier
    // jour un compte qui a déjà des séances.
    throw new Error(`Impossible de charger tes séances : ${readError.message}`);
  }
  const membership = membershipRead.ok ? membershipRead.membership : null;
  const duoId = membership?.duoId ?? null;
  const partnerId = membership?.partnerId ?? null;

  // Lectures propres au duo : AFFICHAGE seulement, une erreur les masque
  // (comme sur l'ancienne page serveur) sans faire échouer l'accueil.
  const [programs, partner, partnerLive, partnerSessionsRes, partnerSetsRes] =
    await Promise.all([
      fetchPrograms(supabase, profileId, duoId),
      partnerId ? getProfile(supabase, partnerId) : Promise.resolve(null),
      partnerId ? fetchPartnerLive(supabase, partnerId) : Promise.resolve(null),
      // Semaine du partenaire seulement : la fenêtre récente suffit.
      partnerId
        ? getCompletedSessionsForDashboard(supabase, partnerId, since)
        : Promise.resolve({ data: [] as DashboardSessionRow[] }),
      partnerId
        ? getAllSetsForProgress(supabase, partnerId)
        : Promise.resolve({ data: [] as ProgressRow[] }),
    ]);
  const partnerSets = partnerSetsRes.data ?? [];
  const exerciseNames = await fetchExerciseNames(supabase, [
    ...new Set(partnerSets.filter((r) => r.sessions?.performed_at).map((r) => r.exercise_id)),
  ]);

  return {
    profile,
    membershipOk: membershipRead.ok,
    duoId,
    partner,
    partnerLive,
    currentSession,
    sessions: sessionsRes.data ?? [],
    doneSessions: (doneRes.data ?? []).map(({ id, program_day_id, performed_at }) => ({
      id,
      program_day_id,
      performed_at,
    })),
    programs,
    partnerSessions: partnerSessionsRes.data ?? [],
    partnerSets,
    exerciseNames,
  };
}

/**
 * Nettoyage opportuniste des séances vides abandonnées (CM-83), lancé par
 * l'accueil à son ouverture. Renvoie le nombre de séances visées.
 */
export async function purgeDashboardSessions(
  supabase: BrowserSupabase,
  profileId: string,
): Promise<number> {
  return purgeAbandonedEmptySessions(supabase, profileId, new Date());
}

// ─────────────────────────────────────────────────────────────────────────────
// Calcul pur de l'affichage
// ─────────────────────────────────────────────────────────────────────────────

/** « Semaine du 5 octobre » (lundi de la semaine en cours). */
export function weekLabel(now: Date): string {
  const monday = new Date(now.getTime() - localWeekdayIndex(now) * 86400000);
  const d = new Intl.DateTimeFormat("fr-FR", {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "long",
  }).format(monday);
  return `Semaine du ${d}`;
}

/** « Dimanche 11 octobre ». */
export function todayLabel(now: Date): string {
  const s = new Intl.DateTimeFormat("fr-FR", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export type FirstDayView = {
  kind: "firstDay";
  name: string;
  accent: string;
  weeklyGoal: number;
  todayIdx: number;
  today: SeanceCard;
  todayMinutes: number;
  seances: SeanceCard[];
};

export type HomeView = {
  kind: "home";
  me: Member;
  /** Partenaire de duo actif, null en solo. */
  partnerMember: Member | null;
  partnerLive: { dayName: string } | null;
  /** Une ligne par membre en duo (CM-87), vide en solo. */
  duoWeek: MemberWeek[];
  partnerRecord: { exerciseName: string; detail: string } | null;
  /** Jours (0 = lundi) de la semaine avec une séance terminée (strip solo). */
  doneThisWeek: number[];
  todayIdx: number;
  banner: ResumeBannerState;
  /** Nom de la séance en cours, pour le bandeau. */
  currentDayName: string;
  seances: SeanceCard[];
  /**
   * Ligne « Suggestion ». Null quand le bandeau de reprise est affiché : il
   * occupe déjà cette place (CM-83).
   */
  recommended: SeanceCard | null;
};

export type DashboardView = FirstDayView | HomeView;

export function buildDashboardView(
  data: DashboardData,
  profileId: string,
  now: Date,
): DashboardView {
  const { profile, partner, currentSession } = data;
  // CM-87 : duo actif (2 membres) seulement ; prénoms et couleurs de membre.
  const members = toMembers(
    [profile, partner].filter((p): p is NonNullable<typeof p> => Boolean(p)),
    profileId,
  );
  const me = members.find((m) => m.isMe) ?? {
    id: profileId,
    name: profile?.display_name ?? "",
    color: memberAccent({}),
    isMe: true,
  };
  const partnerMember = members.find((m) => !m.isMe) ?? null;

  // --- Séance en cours (bandeau de reprise, CM-83) ---
  const banner = resumeBannerState(
    currentSession && {
      id: currentSession.id,
      performedAt: currentSession.performed_at,
      setCreatedAt: (currentSession.session_sets ?? []).map((s) => s.created_at),
    },
    now,
  );

  // --- Historique du profil ---
  //
  // Séances TERMINÉES uniquement (critère centralisé dans
  // `lib/queries/sessions.ts`, CM-83). Une séance terminée sans aucune série
  // ne compte pas non plus : le strip afficherait un jour « fait » sans qu'un
  // seul kilo ait été soulevé (CM-66).
  const sessions = data.sessions.filter((s) => (s.session_sets ?? []).length > 0);
  // CM-89 (PR 0) : nombre de séances et « dernière fois » sur tout
  // l'historique léger, complété par les séances récentes (mêmes ids).
  const done = new Map<string, DoneSessionRow>();
  for (const s of data.doneSessions) done.set(s.id, s);
  for (const s of sessions) done.set(s.id, s);
  const loggedSessionCount = done.size;

  // Semaine ancrée sur `APP_TIME_ZONE`, comme le reste des calculs de jour :
  // sinon une séance du samedi 1 h du matin cocherait le vendredi.
  const todayIdx = localWeekdayIndex(now);
  const weekStartDay = localDayNumber(now) - todayIdx;
  const doneThisWeek = new Set<number>();
  for (const s of sessions) {
    const d = new Date(s.performed_at);
    if (localDayNumber(d) >= weekStartDay) doneThisWeek.add(localWeekdayIndex(d));
  }

  // Dernière exécution par séance type, même calcul que la bibliothèque.
  const lastDoneByDay = buildLastDoneByDay([...done.values()]);
  const history: SessionHistoryEntry[] = sessions.map((s) => ({
    performedAt: s.performed_at,
    groups: (s.session_sets ?? [])
      .map((set) => set.exercises?.muscle_group)
      .filter((g): g is MuscleGroup => Boolean(g)),
  }));
  const recency = muscleRecency(history, now);

  // --- Bibliothèque de séances types ---
  const library: SeanceCard[] = [];
  const restByDay = new Map<string, { target_sets: number; rest_seconds: number }[]>();
  for (const prog of data.programs) {
    const ordered = [...(prog.program_days ?? [])].sort(
      (a, b) => a.order_index - b.order_index,
    );
    for (const d of ordered) {
      const pes = d.program_exercises ?? [];
      restByDay.set(d.id, pes);
      library.push({
        id: d.id,
        name: d.name,
        programName: prog.name,
        exerciseCount: pes.length,
        setCount: countSets(pes),
        // Un groupe par exercice, répétitions comprises : `deriveMuscleTags`
        // s'en sert pour classer le groupe dominant en premier (CM-65).
        groups: pes
          .map((pe) => pe.exercises?.muscle_group)
          .filter((g): g is MuscleGroup => Boolean(g)),
        lastDoneAt: lastDoneByDay.get(d.id) ?? null,
      });
    }
  }

  // La moins faite récemment en premier ; les jamais faites tout en haut.
  const seances = sortByStaleness(library, now);
  const recommended = pickRecommendedSeance(seances, recency, loggedSessionCount, now);

  // CM-86 : premier jour d'un utilisateur sans duo (aucune séance terminée,
  // aucune en cours) : accueil dédié, sans aucune section duo. Seulement pour
  // un solo AVÉRÉ (lecture du duo aboutie).
  const firstDay = seances[0];
  if (
    data.membershipOk &&
    !data.duoId &&
    loggedSessionCount === 0 &&
    banner.kind !== "banner" &&
    firstDay
  ) {
    return {
      kind: "firstDay",
      name: profile?.display_name ?? "",
      accent: memberAccent(profile ?? {}),
      weeklyGoal: profile?.weekly_goal ?? 3,
      todayIdx,
      today: firstDay,
      todayMinutes: estimateSeanceMinutes(restByDay.get(firstDay.id) ?? []),
      seances,
    };
  }

  // --- Duo (CM-87) : semaine de chaque membre, dernier record du partenaire ---
  let duoWeek: MemberWeek[] = [];
  let partnerRecord: HomeView["partnerRecord"] = null;
  if (partner && partnerMember) {
    const weekOf = (rows: { performed_at: string; session_sets: unknown[] }[]) => {
      const days = new Set<number>();
      let count = 0;
      for (const r of rows) {
        if ((r.session_sets ?? []).length === 0) continue;
        const d = new Date(r.performed_at);
        if (localDayNumber(d) < weekStartDay) continue;
        days.add(localWeekdayIndex(d));
        count += 1;
      }
      return { doneDays: [...days], count };
    };
    duoWeek = [
      { ...me, ...weekOf(sessions), goal: profile?.weekly_goal ?? 3 },
      { ...partnerMember, ...weekOf(data.partnerSessions), goal: partner.weekly_goal },
    ];

    // Dernier record battu par le partenaire (charge max dépassée), parmi
    // les exercices dont le nom m'est visible.
    const sets = data.partnerSets.flatMap((r) =>
      r.sessions?.performed_at
        ? [{
            exerciseId: r.exercise_id,
            performedAt: r.sessions.performed_at,
            weightKg: Number(r.weight_kg),
            reps: r.reps,
          }]
        : [],
    );
    const names = data.exerciseNames;
    const record = latestRecord(sets, (id) => Object.hasOwn(names, id));
    if (record) {
      partnerRecord = {
        exerciseName: names[record.exerciseId]!,
        detail: `${formatRecord(record.weightKg, record.reps)} · ${formatLastDone(
          record.performedAt,
          now,
        ).toLocaleLowerCase("fr-FR")}`,
      };
    }
  }

  return {
    kind: "home",
    me,
    partnerMember,
    partnerLive: partner ? data.partnerLive : null,
    duoWeek,
    partnerRecord,
    doneThisWeek: [...doneThisWeek],
    todayIdx,
    banner,
    currentDayName: currentSession?.program_days?.name ?? "Séance",
    seances,
    recommended: banner.kind === "banner" ? null : recommended,
  };
}
