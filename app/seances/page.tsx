import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, readMemberProfiles, DUO_READ_ERROR_MESSAGE } from "@/lib/profile";
import {
  ensureSharedProgram,
  getProgramWithDays,
  readPersonalProgramId,
} from "@/lib/queries/programs";
import type { ProgramFull, ProgramDayFull } from "@/lib/queries/programs";
import { getLastDoneByDay } from "@/lib/queries/sessions";
import { MUSCLE_GROUP_LABELS } from "@/lib/utils/training";
import { countSets, deriveMuscleTags, splitVisibleTags } from "@/lib/utils/seances";
import type { MuscleGroup } from "@/lib/utils/seances";
import { toMembers, type Member } from "@/lib/duo";
import SeanceLibrary from "./SeanceLibrary";
import type { SeanceView } from "./SeanceLibrary";

/**
 * Bibliothèque « Mes séances » (CM-81).
 *
 * CM-87 : en duo, deux sections. « Nos séances » (programme du duo, visible
 * des deux) puis « Mes séances » (programme perso, visible de moi seul). Sans
 * partenaire, une seule liste : la bibliothèque perso.
 *
 * Remplace l'ancien `/programs/[id]` : la notion de programme a disparu de
 * l'UI, la bibliothèque du couple est une page unique et sans id. Elle existe
 * toujours, même vide — `ensureSharedProgram` crée en silence la ligne
 * `programs` que le schéma exige encore, plus aucun écran ne demande de
 * « créer un premier programme ».
 */

/** Cadre commun aux écrans qui n'ont rien à afficher (erreur). */
function Message({
  children,
  retryHref,
}: {
  children: React.ReactNode;
  retryHref?: string;
}) {
  return (
    <main className="min-h-screen p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-16 text-center">
        {children}
        {retryHref && (
          // Lien plein (pas <Link>) : rechargement complet de la page.
          <a
            href={retryHref}
            className="rounded-xl bg-energy px-4 py-2.5 text-sm font-extrabold text-ink"
          >
            Réessayer
          </a>
        )}
        <Link
          href="/dashboard"
          className="rounded-xl bg-surface2 px-4 py-2.5 text-sm font-semibold text-fg"
        >
          ← Retour à l&apos;accueil
        </Link>
      </div>
    </main>
  );
}

/** CTA collant, identique sous la liste et sous l'état vide. */
function NewSeanceCta() {
  return (
    <div className="sticky bottom-0 mt-6 bg-ink/90 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur">
      <Link
        href="/seances/new"
        className="block rounded-2xl bg-energy py-4 text-center text-[18px] font-extrabold text-ink"
      >
        + Nouvelle séance
      </Link>
    </div>
  );
}

type DayWithExercises = ProgramDayFull;

/** Séances types d'un programme, prêtes pour `SeanceLibrary` (tags dérivés, CM-65). */
function toSeanceViews(
  program: ProgramFull | null,
  lastDoneByDay: Map<string, string>,
): SeanceView[] {
  const days: DayWithExercises[] = [...(program?.program_days ?? [])].sort(
    (a, b) => a.order_index - b.order_index,
  );
  return days.map((day) => {
    const exercises = [...day.program_exercises].sort(
      (a, b) => a.order_index - b.order_index,
    );
    const groups = exercises
      .map((pe) => pe.exercises?.muscle_group)
      .filter((g): g is MuscleGroup => Boolean(g));
    const { visible, overflow } = splitVisibleTags(deriveMuscleTags(groups));

    return {
      id: day.id,
      name: day.name,
      exerciseCount: exercises.length,
      setCount: countSets(exercises),
      tags: visible.map((t) => t.label),
      extraTags: overflow,
      lastDoneAt: lastDoneByDay.get(day.id) ?? null,
      exercises: exercises.map((pe) => ({
        id: pe.id,
        name: pe.exercises?.name ?? "Exercice",
        groupLabel: pe.exercises
          ? (MUSCLE_GROUP_LABELS[pe.exercises.muscle_group] ??
            pe.exercises.muscle_group)
          : "",
        targetSets: pe.target_sets,
        repsMin: pe.target_reps_min,
        repsMax: pe.target_reps_max,
      })),
    };
  });
}

function Dot({ member, className = "" }: { member: Member; className?: string }) {
  return (
    <span
      aria-hidden
      className={`h-[18px] w-[18px] rounded-full border-2 border-ink ${className}`}
      style={{ background: member.color }}
    />
  );
}

/** En-tête d'une section de la bibliothèque en duo (maquette 12). */
function SectionHeader({
  id,
  title,
  dots,
  note,
  locked = false,
}: {
  id: string;
  title: string;
  dots: Member[];
  note: string;
  locked?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-none items-center gap-2.5">
        <h2
          id={id}
          className="whitespace-nowrap text-[15px] font-extrabold uppercase tracking-[0.1em] text-fg-muted"
        >
          {title}
        </h2>
        <span className="flex">
          {dots.map((m, i) => (
            <Dot key={m.id} member={m} className={i > 0 ? "-ml-[7px]" : ""} />
          ))}
        </span>
      </div>
      <span className="flex min-w-0 items-center justify-end gap-1.5 text-right text-sm text-fg-muted">
        {locked && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[13px] w-[13px] flex-none" aria-hidden>
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
        {note}
      </span>
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div className="mt-10 flex flex-col items-center text-center">
      <span
        className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-dashed border-line text-3xl font-light text-fg-muted"
        aria-hidden
      >
        +
      </span>
      <h2 className="mt-4 text-balance text-xl font-extrabold text-fg">
        Aucune séance type
      </h2>
      <p className="mt-2 max-w-xs text-balance text-sm text-fg-muted">
        Compose ta première séance&nbsp;: choisis les exercices, elle sera prête
        sur l&apos;accueil à chaque entraînement.
      </p>
    </div>
  );
}

function LoadError({ detail }: { detail?: string }) {
  return (
    <Message retryHref="/seances">
      <p
        role="alert"
        className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
      >
        Impossible de charger tes séances{detail ? ` (${detail})` : ""}. Réessaie dans un instant.
      </p>
    </Message>
  );
}

export default async function SeancesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; info?: string }>;
}) {
  // Les actions de la bibliothèque qui redirigent font voyager leur message
  // d'erreur en query string (CM-70) ; `info` : message de l'éditeur (CM-87,
  // copie au lieu d'un déplacement).
  const { error: actionError, info } = await searchParams;
  const profileId = await requireProfileId("/seances");
  const supabase = await createClient();

  // CM-86 / CM-87 : sans partenaire, la bibliothèque perso seule ; en duo,
  // celle du duo puis la perso.
  // C3 : duo illisible => erreur ; la bibliothèque perso n'est JAMAIS créée
  // au simple affichage (elle l'est à la première séance enregistrée).
  const read = await readMemberProfiles(supabase, profileId);
  if (!read.ok) {
    return (
      <Message retryHref="/seances">
        <p
          role="alert"
          className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
        >
          {DUO_READ_ERROR_MESSAGE}
        </p>
      </Message>
    );
  }
  const { duoId, profiles } = read;
  const members = toMembers(profiles, profileId);
  const me = members.find((m) => m.isMe);
  const partner = members.find((m) => !m.isMe);

  let sharedProgram: ProgramFull | null = null;
  let personalProgram: ProgramFull | null = null;

  if (duoId) {
    const shared = await ensureSharedProgram(supabase, duoId);
    if (!shared.ok) return <LoadError detail={shared.error} />;
    sharedProgram = (await getProgramWithDays(supabase, shared.programId)).data as ProgramFull | null;
    if (!sharedProgram) return <LoadError />;
  }
  // Perso : lu, jamais créé ici (vide tant qu'aucune séance n'y est rangée).
  const personal = await readPersonalProgramId(supabase, profileId);
  if (!personal.ok) return <LoadError detail={personal.error} />;
  if (personal.programId) {
    personalProgram = (await getProgramWithDays(supabase, personal.programId)).data as ProgramFull | null;
    if (!personalProgram) return <LoadError />;
  }

  const allDayIds = [
    ...(sharedProgram?.program_days ?? []),
    ...(personalProgram?.program_days ?? []),
  ].map((d) => d.id);

  // « Dernière fois » du profil courant : le même calcul que l'accueil, partagé
  // dans `lib/queries/sessions.ts` plutôt que recopié ici.
  const lastDoneByDay = await getLastDoneByDay(supabase, profileId, allDayIds);

  const ours = toSeanceViews(sharedProgram, lastDoneByDay);
  const mine = toSeanceViews(personalProgram, lastDoneByDay);
  const total = ours.length + mine.length;
  const now = new Date().toISOString();

  return (
    <main className="min-h-[100dvh] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-lg">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm text-fg-muted hover:text-fg">
          ‹ Accueil
        </Link>

        <h1 className="mt-1 text-[30px] font-black tracking-tight text-fg">
          {duoId ? "Séances" : "Mes séances"}
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {total} séance{total > 1 ? "s" : ""} type
          {total > 1 ? "s" : ""} · réordonne avec les flèches
        </p>

        {actionError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
          >
            {actionError}
          </p>
        )}

        {info && (
          <p
            role="status"
            className="mt-4 text-balance rounded-lg border border-energy/30 bg-energy/10 px-3 py-2.5 text-sm text-fg"
          >
            {info}
          </p>
        )}

        {/* C6 : les deux sections dès que le duo est connu, même si le profil
            du partenaire est illisible (prénom et couleur neutres). */}
        {duoId ? (
          <>
            <section aria-labelledby="nos-seances" className="mt-6">
              <SectionHeader
                id="nos-seances"
                title="Nos séances"
                dots={[me, partner].filter((m): m is Member => Boolean(m))}
                note={partner ? `Partagées avec ${partner.name}` : "Partagées dans ton duo"}
              />
              <div className="mt-2.5">
                {ours.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-fg-muted">
                    Aucune séance commune pour l&apos;instant.
                  </p>
                ) : (
                  <SeanceLibrary seances={ours} now={now} />
                )}
              </div>
            </section>

            <section aria-labelledby="mes-seances" className="mt-7">
              <SectionHeader
                id="mes-seances"
                title="Mes séances"
                dots={me ? [me] : []}
                note="Visibles par toi uniquement"
                locked
              />
              <div className="mt-2.5">
                {mine.length === 0 ? (
                  <p className="text-balance rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-fg-muted">
                    Les séances créées «&nbsp;Pour moi&nbsp;» arrivent ici. {partner?.name ?? "Ton partenaire"} ne les voit pas.
                  </p>
                ) : (
                  <SeanceLibrary seances={mine} now={now} />
                )}
              </div>
            </section>
          </>
        ) : mine.length === 0 ? (
          <EmptyLibrary />
        ) : (
          <div className="mt-5">
            <SeanceLibrary seances={mine} now={now} />
          </div>
        )}

        <NewSeanceCta />
      </div>
    </main>
  );
}
