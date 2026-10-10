import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, readDuoId, DUO_READ_ERROR_MESSAGE } from "@/lib/profile";
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
import SeanceLibrary from "./SeanceLibrary";
import type { SeanceView } from "./SeanceLibrary";

/**
 * Bibliothèque « Mes séances » (CM-81).
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

export default async function SeancesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  // Les actions de la bibliothèque qui redirigent font voyager leur message
  // d'erreur en query string (CM-70).
  const { error: actionError } = await searchParams;
  const profileId = await requireProfileId("/seances");
  const supabase = await createClient();

  // CM-86 : sans duo, la bibliothèque perso. C3 : duo illisible => erreur,
  // et la bibliothèque perso n'est JAMAIS créée au simple affichage (elle
  // l'est à la première séance enregistrée, cf. `saveSeance`).
  const membership = await readDuoId(supabase, profileId);
  if (!membership.ok) {
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
  const duoId = membership.duoId;

  let programId: string | null;
  let loadError: string | null = null;
  if (duoId) {
    const shared = await ensureSharedProgram(supabase, duoId);
    programId = shared.ok ? shared.programId : null;
    if (!shared.ok) loadError = shared.error;
  } else {
    const personal = await readPersonalProgramId(supabase, profileId);
    programId = personal.ok ? personal.programId : null;
    if (!personal.ok) loadError = personal.error;
  }
  if (loadError) {
    return (
      <Message retryHref="/seances">
        <p
          role="alert"
          className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
        >
          Impossible de charger tes séances ({loadError}).
        </p>
      </Message>
    );
  }

  // Solo sans bibliothèque encore créée : liste vide, rien n'est écrit.
  let days: ProgramDayFull[] = [];
  if (programId) {
    const { data } = await getProgramWithDays(supabase, programId);
    const program = data as ProgramFull | null;
    if (!program) {
      return (
        <Message retryHref="/seances">
          <p
            role="alert"
            className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
          >
            Impossible de charger tes séances. Réessaie dans un instant.
          </p>
        </Message>
      );
    }
    days = [...program.program_days].sort((a, b) => a.order_index - b.order_index);
  }

  // « Dernière fois » du profil courant : le même calcul que l'accueil, partagé
  // dans `lib/queries/sessions.ts` plutôt que recopié ici.
  const lastDoneByDay = await getLastDoneByDay(
    supabase,
    profileId,
    days.map((day) => day.id),
  );

  // Les tags sont dérivés ici, à la volée, depuis `exercises.muscle_group` :
  // rien n'est stocké sur la séance (CM-65).
  const seances: SeanceView[] = days.map((day) => {
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

  return (
    <main className="min-h-[100dvh] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-lg">
        <Link href="/dashboard" className="text-sm text-fg-muted hover:text-fg">
          ‹ Accueil
        </Link>

        <h1 className="mt-3 text-[30px] font-black tracking-tight text-fg">
          Mes séances
        </h1>
        <p className="mt-1 text-sm text-fg-muted">
          {seances.length} séance{seances.length > 1 ? "s" : ""} type
          {seances.length > 1 ? "s" : ""} · réordonne avec les flèches
        </p>

        {actionError && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
          >
            {actionError}
          </p>
        )}

        {seances.length === 0 ? (
          <div className="mt-10 flex flex-col items-center text-center">
            <span
              className="flex h-16 w-16 items-center justify-center rounded-[20px] border border-dashed border-line text-3xl font-light text-fg-faint"
              aria-hidden
            >
              +
            </span>
            <h2 className="mt-4 text-xl font-extrabold text-fg">
              Aucune séance type
            </h2>
            <p className="mt-2 max-w-xs text-sm text-fg-muted">
              Compose ta première séance : choisis les exercices, elle sera prête
              sur l&apos;accueil à chaque entraînement.
            </p>
          </div>
        ) : (
          <div className="mt-5">
            <SeanceLibrary seances={seances} now={new Date().toISOString()} />
          </div>
        )}

        <NewSeanceCta />
      </div>
    </main>
  );
}
