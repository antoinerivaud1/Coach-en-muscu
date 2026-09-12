import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  requireProfileId,
  getProfile,
  getCoupleId,
  getCoupleProfileIds,
} from "@/lib/profile";
import { startSession } from "@/app/programs/[id]/actions";
import { getSharedProgramId } from "@/lib/queries/programs";
import {
  getCompletedSessionsForDashboard,
  getCurrentSession,
  purgeAbandonedEmptySessions,
} from "@/lib/queries/sessions";
import { resumeBannerState } from "@/lib/utils/currentSession";
import BottomNav from "@/components/BottomNav";
import ResumeSessionBanner from "@/components/ResumeSessionBanner";
import { clearProfile } from "@/app/actions";
import { countSets, deriveMuscleTags, splitVisibleTags } from "@/lib/utils/seances";
import type { MuscleGroup } from "@/lib/utils/seances";
import {
  APP_TIME_ZONE,
  formatLastDone,
  localDayNumber,
  localWeekdayIndex,
  pickRecommendedSeance,
  recentMuscleGroups,
  sortByStaleness,
} from "@/lib/utils/recommendation";
import type { SeanceCard, SessionHistoryEntry } from "@/lib/utils/recommendation";

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];

/** Nombre de tags musculaires affichés sur une carte de la grille (2 colonnes). */
const CARD_VISIBLE_TAGS = 2;

function todayLabel(): string {
  const s = new Intl.DateTimeFormat("fr-FR", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // `startSession` et `deleteProgram` redirigent ici en cas d'échec : le
  // message voyage en query string et doit être affiché (CM-70).
  const { error: actionError } = await searchParams;
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const profile = await getProfile(supabase, profileId);
  const coupleId = await getCoupleId(supabase, profileId);
  const isElle = profile?.color_role === "elle";
  const accent = isElle ? "text-elle" : "text-toi";

  let partnerName: string | null = null;
  let partnerIsElle = false;
  let partnerLive: { dayName: string } | null = null;
  if (coupleId) {
    const pids = await getCoupleProfileIds(supabase, coupleId);
    const partnerId = pids.find((id) => id !== profileId);
    if (partnerId) {
      const partner = await getProfile(supabase, partnerId);
      partnerName = partner?.display_name ?? null;
      partnerIsElle = partner?.color_role === "elle";
      // Séance en cours = pas encore terminée (duration null) et récente (< 3 h).
      const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
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
      if (row) partnerLive = { dayName: row.program_days?.name ?? "une séance" };
    }
  }

  const now = new Date();

  // --- Séance en cours (bandeau de reprise, CM-83) ---
  //
  // Le nettoyage tourne AVANT la lecture : une séance vide et abandonnée depuis
  // plus de 2 h ne doit pas être proposée en reprise, elle ne contient rien.
  // Nettoyage opportuniste et idempotent, volontairement sans cron ni job.
  await purgeAbandonedEmptySessions(supabase, profileId, now);
  const currentSession = await getCurrentSession(supabase, profileId);
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
  // Séances TERMINÉES uniquement : une séance en cours a des séries dès le
  // premier « Valider » (CM-78), la compter cocherait le jour dans le strip et
  // daterait la « dernière fois » d'une séance pas encore finie (CM-83). Le
  // critère est centralisé dans `lib/queries/sessions.ts`.
  const { data: sessRows } = await getCompletedSessionsForDashboard(
    supabase,
    profileId,
  );

  // Une séance terminée sans aucune série (démarrée puis clôturée à vide) ne
  // compte pas non plus : le strip d'assiduité afficherait un jour « fait » sans
  // qu'un seul kilo ait été soulevé, et la dernière exécution d'une séance serait
  // datée d'un simple tap. C'est le comportement retenu depuis CM-66.
  const sessions = (sessRows ?? []).filter((s) => (s.session_sets ?? []).length > 0);
  const loggedSessionCount = sessions.length;

  // Semaine ancrée sur `APP_TIME_ZONE`, comme le reste des calculs de jour :
  // sinon une séance du samedi 1 h du matin cocherait le vendredi.
  const todayIdx = localWeekdayIndex(now);
  const weekStartDay = localDayNumber(now) - todayIdx;
  const doneThisWeek = new Set<number>();
  for (const s of sessions) {
    const d = new Date(s.performed_at);
    if (localDayNumber(d) >= weekStartDay) doneThisWeek.add(localWeekdayIndex(d));
  }

  // Dernière exécution par séance type. Les sessions arrivent triées par
  // `performed_at` décroissant : la première rencontrée est la plus récente.
  const lastDoneByDay = new Map<string, string>();
  for (const s of sessions) {
    if (s.program_day_id && !lastDoneByDay.has(s.program_day_id)) {
      lastDoneByDay.set(s.program_day_id, s.performed_at);
    }
  }

  const history: SessionHistoryEntry[] = sessions.map((s) => ({
    performedAt: s.performed_at,
    groups: (s.session_sets ?? [])
      .map((set) => set.exercises?.muscle_group)
      .filter((g): g is MuscleGroup => Boolean(g)),
  }));
  const recentGroups = recentMuscleGroups(history, now);

  // --- Bibliothèque de séances types ---
  //
  // Les programmes partagés ont `owner_profile_id` à null et ne remontent que
  // par la branche `couple_id` du `or(...)`.
  let q = supabase
    .from("programs")
    .select(
      "id, name, couple_id, owner_profile_id, created_at, program_days(id, name, order_index, program_exercises(target_sets, exercises(muscle_group)))",
    )
    .order("created_at", { ascending: true });
  q = coupleId
    ? q.or(`owner_profile_id.eq.${profileId},couple_id.eq.${coupleId}`)
    : q.eq("owner_profile_id", profileId);
  const { data: progData } = await q.returns<
    {
      id: string;
      name: string;
      couple_id: string | null;
      program_days: {
        id: string;
        name: string;
        order_index: number;
        program_exercises: {
          target_sets: number;
          exercises: { muscle_group: MuscleGroup } | null;
        }[];
      }[];
    }[]
  >();

  const library: SeanceCard[] = [];
  for (const prog of progData ?? []) {
    const ordered = [...(prog.program_days ?? [])].sort(
      (a, b) => a.order_index - b.order_index,
    );
    for (const d of ordered) {
      const pes = d.program_exercises ?? [];
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

  // Point d'entrée vers la bibliothèque partagée « Nos séances » (CM-80).
  // Sans programme partagé, le lien bascule sur la création existante : on ne
  // crée jamais de programme automatiquement.
  const sharedProgramId = coupleId
    ? await getSharedProgramId(supabase, coupleId)
    : null;

  // La moins faite récemment en premier ; les jamais faites tout en haut.
  const seances = sortByStaleness(library, now);
  const recommended = pickRecommendedSeance(
    seances,
    recentGroups,
    loggedSessionCount,
    now,
  );

  return (
    <main className="min-h-[100dvh] px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-start justify-between">
        <div>
          <div className="text-[13px] font-semibold tracking-wide text-fg-muted">
            {todayLabel()}
          </div>
          <h1 className="mt-1 text-[30px] font-black tracking-tight text-fg">
            Salut, <span className={accent}>{profile?.display_name}</span>
          </h1>
          {partnerName && (
            <p className="mt-1 text-sm text-fg-muted">En binôme avec {partnerName}</p>
          )}
        </div>
        <span
          className={`flex h-[46px] w-[46px] items-center justify-center rounded-2xl border font-oswald text-xl font-bold ${
            isElle ? "border-elle/40 bg-elle/10 text-elle" : "border-toi/40 bg-toi/10 text-toi"
          }`}
          aria-hidden
        >
          {isElle ? "E" : "L"}
        </span>
      </header>

      {actionError && (
        <p
          role="alert"
          className="mt-5 rounded-2xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-400"
        >
          {actionError}
        </p>
      )}

      {partnerLive && (
        <div
          className={`mt-5 flex items-center gap-3 rounded-2xl border px-4 py-3 ${
            partnerIsElle ? "border-elle/30 bg-elle/10" : "border-toi/30 bg-toi/10"
          }`}
        >
          <span
            className={`h-2.5 w-2.5 flex-none animate-pulse rounded-full ${
              partnerIsElle ? "bg-elle" : "bg-toi"
            }`}
          />
          <div className="text-sm">
            <span className="font-bold text-fg">{partnerName}</span>
            <span className="text-fg-muted">
              {" "}s&apos;entraîne en ce moment · {partnerLive.dayName}
            </span>
          </div>
        </div>
      )}

      {/* Strip de la semaine */}
      <div className="mt-6 flex justify-between gap-1.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
        {WEEK.map((d, i) => {
          const done = doneThisWeek.has(i);
          const isToday = i === todayIdx;
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span
                className={`text-[10px] font-bold ${isToday ? "text-energy" : "text-fg-muted"}`}
              >
                {d}
              </span>
              <span
                className={`h-6 w-6 rounded-lg ${
                  done
                    ? "bg-energy"
                    : isToday
                      ? "border-2 border-energy bg-transparent"
                      : "bg-surface2"
                }`}
              />
            </div>
          );
        })}
      </div>

      {/* Séance en cours : toujours visible, même si la bibliothèque est vide.
          Ne bloque rien, la grille en dessous reste tapable (CM-83). */}
      {banner.kind === "banner" && (
        <ResumeSessionBanner
          sessionId={banner.sessionId}
          dayName={currentSession?.program_days?.name ?? "Séance"}
          setCount={banner.setCount}
          stale={banner.stale}
        />
      )}

      {seances.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-fg">Aucun programme pour l&apos;instant</p>
          <p className="mt-1 text-sm text-fg-muted">
            Crée ton premier programme pour commencer à t&apos;entraîner
          </p>
          <Link
            href="/programs/new"
            className="mt-4 inline-block rounded-xl bg-energy px-5 py-2.5 font-extrabold text-ink"
          >
            Créer mon premier programme
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-2.5 ml-0.5 mt-6 text-[11px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
            Choisis ta séance
          </p>

          {/* Bandeau de suggestion : une seule ligne, purement indicatif. Rien
              n'est verrouillé, taper une autre carte reste immédiat. Masqué
              quand une séance est en cours : le bandeau de reprise occupe déjà
              cette place (CM-83). */}
          {banner.kind !== "banner" && recommended && (
            <form action={startSession} className="mb-2.5">
              <input type="hidden" name="day_id" value={recommended.id} />
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-[14px] border border-energy/30 bg-energy/10 px-3.5 py-2.5 text-left"
              >
                <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.12em] text-energy">
                  Suggestion
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-fg">
                  {recommended.name}
                </span>
                <span className="shrink-0 text-[11px] font-semibold text-fg-muted">
                  {formatLastDone(recommended.lastDoneAt, now)}
                </span>
              </button>
            </form>
          )}

          {/* Grille : un tap = une séance démarrée, sans écran intermédiaire. */}
          <div className="grid grid-cols-2 gap-2.5">
            {seances.map((seance) => {
              const isEmpty = seance.exerciseCount === 0;
              const { visible, overflow } = splitVisibleTags(
                deriveMuscleTags(seance.groups),
                CARD_VISIBLE_TAGS,
              );
              return (
                <form key={seance.id} action={startSession}>
                  <input type="hidden" name="day_id" value={seance.id} />
                  <button
                    type="submit"
                    disabled={isEmpty}
                    title={
                      isEmpty ? "Ajoute au moins un exercice pour démarrer" : undefined
                    }
                    className={`flex h-full w-full flex-col items-start rounded-2xl border p-3.5 text-left disabled:opacity-50 ${
                      isEmpty
                        ? "border-dashed border-flame/40 bg-surface/60"
                        : "border-line bg-surface"
                    }`}
                  >
                    <span className="line-clamp-2 w-full text-[17px] font-extrabold leading-tight text-fg">
                      {seance.name}
                    </span>
                    <span className="mt-1 text-[11px] font-semibold text-fg-muted">
                      {isEmpty
                        ? "Séance vide"
                        : `${seance.exerciseCount} exercice${
                            seance.exerciseCount > 1 ? "s" : ""
                          }`}
                    </span>

                    {visible.length > 0 && (
                      <span className="mt-2 flex flex-wrap gap-1">
                        {visible.map((tag) => (
                          <span
                            key={tag.group}
                            className="rounded-full border border-line bg-surface2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-fg-muted"
                          >
                            {tag.label}
                          </span>
                        ))}
                        {overflow > 0 && (
                          <span className="rounded-full border border-line bg-surface2 px-2 py-0.5 text-[10px] font-bold text-fg-muted">
                            +{overflow}
                          </span>
                        )}
                      </span>
                    )}

                    <span className="mt-auto pt-2.5 text-[11px] font-semibold text-fg-faint">
                      {formatLastDone(seance.lastDoneAt, now)}
                    </span>
                  </button>
                </form>
              );
            })}
          </div>
        </>
      )}

      {/* Bibliothèque de séances types (accès complet) */}
      <div className="mt-7 flex items-center justify-between">
        <Link
          href={sharedProgramId ? `/programs/${sharedProgramId}` : "/programs/new"}
          className="text-sm font-semibold text-energy"
        >
          {sharedProgramId ? "Gérer mes séances" : "Créer ma première séance"}
        </Link>
        <form action={clearProfile}>
          <button
            type="submit"
            className="text-sm font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Changer de profil
          </button>
        </form>
      </div>

      <BottomNav />
    </main>
  );
}
