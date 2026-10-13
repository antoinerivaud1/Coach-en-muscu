"use client";

import { useMemo, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useDashboard, usePurgeAbandonedSessions } from "@/hooks/data/useDashboard";
import { useStartSession } from "@/hooks/data/useStartSession";
import { useRefreshSessionPacks } from "@/hooks/data/useSessionPacks";
import { useLocalSession } from "@/hooks/data/useLocalSession";
import { useOnline } from "@/hooks/useOnline";
import {
  buildDashboardView,
  todayLabel,
  weekLabel,
  type HomeView,
} from "@/lib/data/dashboard";
import BottomNav from "@/components/BottomNav";
import FirstDayHome from "@/components/home/FirstDayHome";
import MemberAvatar from "@/components/onboarding/MemberAvatar";
import DuoAvatars from "@/components/duo/DuoAvatars";
import DuoWeekCard from "@/components/duo/DuoWeekCard";
import PartnerActivityCard from "@/components/duo/PartnerActivityCard";
import { hasPendingClosure } from "@/lib/pendingSessions";
import ResumeSessionBanner from "@/components/ResumeSessionBanner";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";
import OfflineBanner from "@/components/OfflineBanner";
import { isShowingOfflineData } from "@/lib/offline/readCache";
import { hasPendingStart } from "@/lib/offline/pendingStarts";
import { queueStore } from "@/lib/offline/queueStore";
import { resumeBannerState } from "@/lib/utils/currentSession";
import { memberStyle } from "@/lib/duo";
import { deriveMuscleTags, splitVisibleTags } from "@/lib/utils/seances";
import { formatLastDone } from "@/lib/utils/recommendation";

const WEEK = ["L", "M", "M", "J", "V", "S", "D"];

/** Ce qu'affiche le bandeau « Reprendre ». */
type Resume = { sessionId: string; dayName: string; setCount: number; stale: boolean };

/** Nombre de tags musculaires affichés sur une carte de la grille (2 colonnes). */
const CARD_VISIBLE_TAGS = 2;

const MAIN_CLASS = "min-h-[100dvh] px-5 pb-28 pt-[max(1rem,env(safe-area-inset-top))]";

/** Accueil en cours de chargement (première ouverture) ou en erreur. */
export function DashboardShell({ children }: { children?: React.ReactNode }) {
  return (
    <main className={MAIN_CLASS}>
      <div className="mt-2">
        {children ?? <ScreenSkeleton label="Chargement de l'accueil" />}
      </div>
      <BottomNav />
    </main>
  );
}

/**
 * Accueil (`/dashboard`). CM-88 (PR 4) : écran client. Session lue dans le
 * navigateur (`useRequireProfileId`, renvoi vers `/login?next=%2Fdashboard`),
 * données lues sous RLS (`useDashboard`), séance démarrée dans le navigateur
 * (`useStartSession`), nettoyage des séances vides abandonnées à l'ouverture
 * (`usePurgeAbandonedSessions`). Même rendu que l'ancienne page serveur.
 */
export default function DashboardScreen() {
  // Un démarrage en échec revient ici avec le message en query string (CM-70).
  const actionError = useSearchParams().get("error") ?? undefined;
  const auth = useRequireProfileId("/dashboard");
  const profileId = auth.profileId;
  usePurgeAbandonedSessions(profileId);
  const dashboard = useDashboard(profileId);
  const start = useStartSession(profileId);
  // CM-90 (PR 2) : packs séance pour démarrer hors ligne, préparés en fond.
  const programs = dashboard.data?.programs;
  const dayIds = useMemo(
    () => (programs ? programs.flatMap((p) => p.program_days.map((d) => d.id)) : null),
    [programs],
  );
  useRefreshSessionPacks(profileId, dashboard.isFetchedAfterMount ? dayIds : null);
  // CM-90 (PR 4) : séance en cours gardée sur le téléphone.
  const online = useOnline();
  const local = useLocalSession(profileId);
  const offlineShown = isShowingOfflineData([dashboard], online);

  // Recalculé à chaque nouvelle donnée, avec l'heure courante (« Hier »,
  // semaine en cours, bandeau périmé…).
  const view = useMemo(() => {
    if (!dashboard.data || !profileId) return null;
    const now = new Date();
    return { now, ...buildDashboardView(dashboard.data, profileId, now) };
  }, [dashboard.data, profileId]);

  if (auth.error) {
    return (
      <DashboardShell>
        <ScreenError onRetry={() => void auth.refetch()} />
      </DashboardShell>
    );
  }
  if (dashboard.error && !dashboard.data) {
    return (
      <DashboardShell>
        <ScreenError onRetry={() => void dashboard.refetch()} />
      </DashboardShell>
    );
  }
  if (!view || !profileId) return <DashboardShell />;

  // CM-90 (PR 4) : « Reprendre » pour une séance que l'accueil ne peut pas
  // connaître : démarrée hors ligne (pas encore en base), ou accueil affiché
  // depuis sa copie locale. En ligne avec un accueil à jour, le serveur fait
  // foi (séance close ou supprimée ailleurs : pas de bandeau).
  let localResume: Resume | null = null;
  if (local && (offlineShown || hasPendingStart(queueStore(), local.sessionId))) {
    const state = resumeBannerState(
      {
        id: local.sessionId,
        performedAt: local.startedAt,
        setCreatedAt: Array.from({ length: local.setCount }, () => local.startedAt),
      },
      view.now,
    );
    if (state.kind === "banner") {
      localResume = { sessionId: local.sessionId, dayName: local.dayName, setCount: state.setCount, stale: state.stale };
    }
  }

  // CM-90 (PR 3) : accueil affiché depuis la copie locale.
  const notice = <OfflineBanner sources={[dashboard]} className="mt-4" />;

  // CM-88 (PR 6) : toute écriture de séance (démarrage, fin, abandon,
  // suppression) invalide ce cache : ses données sont à jour, le bandeau
  // « Reprendre » et l'accueil du premier jour s'affichent sans attendre.
  if (view.kind === "firstDay") {
    return (
      <FirstDayHome
        name={view.name}
        accent={view.accent}
        weeklyGoal={view.weeklyGoal}
        todayIdx={view.todayIdx}
        today={view.today}
        todayMinutes={view.todayMinutes}
        seances={view.seances}
        error={actionError}
        notice={notice}
        onStart={start}
      />
    );
  }

  return (
    <Home
      view={view}
      now={view.now}
      profileId={profileId}
      actionError={actionError}
      notice={notice}
      localResume={localResume}
      onStart={start}
    />
  );
}

function Home({
  view,
  now,
  profileId,
  actionError,
  notice,
  localResume,
  onStart,
}: {
  view: HomeView;
  now: Date;
  profileId: string;
  actionError?: string;
  notice: React.ReactNode;
  localResume: Resume | null;
  onStart: (dayId: string) => void;
}) {
  const {
    me,
    partnerMember,
    partnerLive,
    duoWeek,
    partnerRecord,
    todayIdx,
    banner,
    seances,
    recommended,
  } = view;
  const doneThisWeek = new Set(view.doneThisWeek);
  const resume: Resume | null =
    banner.kind === "banner" && !hasPendingClosure(banner.sessionId)
      ? {
          sessionId: banner.sessionId,
          dayName: view.currentDayName,
          setCount: banner.setCount,
          stale: banner.stale,
        }
      : localResume;
  const startOnSubmit = (dayId: string) => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onStart(dayId);
  };

  return (
    <main className={MAIN_CLASS} style={memberStyle(me.color)}>
      <header className="flex items-start justify-between">
        <div>
          <div className="text-[15px] font-semibold tracking-wide text-fg-muted">
            {todayLabel(now)}
          </div>
          <h1 className="mt-1 text-[30px] font-black tracking-tight text-fg">
            Salut, <span style={{ color: me.color }}>{me.name}</span>
          </h1>
        </div>
        {partnerMember ? (
          <DuoAvatars members={[me, partnerMember]} />
        ) : (
          <MemberAvatar name={me.name} color={me.color} size={46} />
        )}
      </header>

      {notice}

      {actionError && (
        <p
          role="alert"
          className="mt-5 rounded-2xl border border-red-400/40 bg-red-400/10 px-4 py-3 text-sm text-red-400"
        >
          {actionError}
        </p>
      )}

      {partnerLive && partnerMember && (
        <div
          className="mt-5 flex items-center gap-3 rounded-2xl border px-4 py-3"
          style={{
            borderColor: `${partnerMember.color}4D`,
            background: `${partnerMember.color}1A`,
          }}
        >
          <span
            className="h-2.5 w-2.5 flex-none animate-pulse rounded-full"
            style={{ background: partnerMember.color }}
          />
          <div className="text-sm">
            <span className="font-bold" style={{ color: partnerMember.color }}>
              {partnerMember.name}
            </span>
            <span className="text-fg-muted">
              {" "}s&apos;entraîne en ce moment · {partnerLive.dayName}
            </span>
          </div>
        </div>
      )}

      {/* Semaine : une ligne par membre en duo (CM-87), sinon le strip solo. */}
      {duoWeek.length > 1 ? (
        <>
          <DuoWeekCard
            members={duoWeek}
            todayIdx={todayIdx}
            weekLabel={weekLabel(now)}
          />
          {partnerRecord && partnerMember && (
            <PartnerActivityCard
              name={partnerMember.name}
              color={partnerMember.color}
              exerciseName={partnerRecord.exerciseName}
              detail={partnerRecord.detail}
            />
          )}
        </>
      ) : (
        <div className="mt-6 flex justify-between gap-1.5 rounded-[18px] border border-line bg-surface px-4 py-3.5">
          {WEEK.map((d, i) => {
            const done = doneThisWeek.has(i);
            const isToday = i === todayIdx;
            return (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <span
                  className={`text-[12px] font-bold ${isToday ? "text-energy" : "text-fg-muted"}`}
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
      )}

      {/* Séance en cours : toujours visible, même si la bibliothèque est vide.
          Ne bloque rien, la grille en dessous reste tapable (CM-83). */}
      {resume && (
        <ResumeSessionBanner
          profileId={profileId}
          sessionId={resume.sessionId}
          dayName={resume.dayName}
          setCount={resume.setCount}
          stale={resume.stale}
        />
      )}

      {seances.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-fg">Aucune séance type pour l&apos;instant</p>
          <p className="mt-1 text-sm text-fg-muted">
            Compose ta première séance pour commencer à t&apos;entraîner
          </p>
          <Link
            href="/seances/new"
            className="mt-4 inline-block rounded-xl bg-energy px-5 py-2.5 font-extrabold text-ink"
          >
            Créer ma première séance
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-2.5 ml-0.5 mt-6 text-[13px] font-extrabold uppercase tracking-[0.16em] text-fg-muted">
            Choisis ta séance
          </p>

          {/* Bandeau de suggestion : une seule ligne, purement indicatif. Rien
              n'est verrouillé, taper une autre carte reste immédiat. Masqué
              quand une séance est en cours : le bandeau de reprise occupe déjà
              cette place (CM-83). */}
          {!resume && recommended && (
            <form onSubmit={startOnSubmit(recommended.id)} className="mb-2.5">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-[14px] border border-energy/30 bg-energy/10 px-3.5 py-2.5 text-left"
              >
                <span className="shrink-0 text-[12px] font-extrabold uppercase tracking-[0.12em] text-energy">
                  Suggestion
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-fg">
                  {recommended.name}
                </span>
                <span className="shrink-0 text-[13px] font-semibold text-fg-muted">
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
                <form key={seance.id} onSubmit={startOnSubmit(seance.id)}>
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
                    <span className="line-clamp-2 w-full text-[18px] font-extrabold leading-tight text-fg">
                      {seance.name}
                    </span>
                    <span className="mt-1 text-[13px] font-semibold text-fg-muted">
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
                            className="rounded-full border border-line bg-surface2 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-fg-muted"
                          >
                            {tag.label}
                          </span>
                        ))}
                        {overflow > 0 && (
                          <span className="rounded-full border border-line bg-surface2 px-2 py-0.5 text-[12px] font-bold text-fg-muted">
                            +{overflow}
                          </span>
                        )}
                      </span>
                    )}

                    <span className="mt-auto pt-2.5 text-[13px] font-semibold text-fg-faint">
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
        <Link href="/seances" className="text-sm font-semibold text-energy">
          Gérer mes séances
        </Link>
      </div>

      <BottomNav />
    </main>
  );
}
