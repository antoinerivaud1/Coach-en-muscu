import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { requireProfileId, readDuoId, DUO_READ_ERROR_MESSAGE } from "@/lib/profile";
import { getCatalogExercises } from "@/lib/queries/exercises";
import type { SystemExercise } from "@/lib/queries/exercises";
import {
  getPersonalProgramId,
  getProgramDayNames,
  getSharedProgramId,
} from "@/lib/queries/programs";
import SeanceBuilder from "../SeanceBuilder";

/**
 * Création d'une séance type (CM-81).
 *
 * Aucun programme n'est créé ici : `saveSeance` s'en charge à
 * l'enregistrement. Cette page ne fait que préparer l'écran — le catalogue
 * d'exercices et les noms déjà pris s'il existe déjà une bibliothèque.
 */
export default async function NewSeancePage() {
  const profileId = await requireProfileId("/seances/new");
  const supabase = await createClient();

  // CM-86 : sans duo, la séance ira dans la bibliothèque perso (créée à
  // l'enregistrement, jamais ici). C3 : duo illisible => écran d'erreur.
  const membership = await readDuoId(supabase, profileId);
  if (!membership.ok) {
    return (
      <main className="min-h-screen p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-16 text-center">
          <p
            role="alert"
            className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
          >
            {DUO_READ_ERROR_MESSAGE}
          </p>
          <a
            href="/seances/new"
            className="rounded-xl bg-energy px-4 py-2.5 text-sm font-extrabold text-ink"
          >
            Réessayer
          </a>
          <Link
            href="/seances"
            className="rounded-xl bg-surface2 px-4 py-2.5 text-sm font-semibold text-fg"
          >
            Retour à mes séances
          </Link>
        </div>
      </main>
    );
  }
  const duoId = membership.duoId;

  const { data: catalogData } = await getCatalogExercises(supabase, duoId, profileId);
  const catalog: SystemExercise[] = catalogData ?? [];

  const libraryProgramId = duoId
    ? await getSharedProgramId(supabase, duoId)
    : await getPersonalProgramId(supabase, profileId);
  const siblings = libraryProgramId
    ? await getProgramDayNames(supabase, libraryProgramId)
    : null;
  const otherNames =
    siblings && siblings.ok ? siblings.days.map((d) => d.name) : [];

  return (
    <SeanceBuilder
      mode="create"
      initialName=""
      initialExercises={[]}
      otherNames={otherNames}
      catalog={catalog}
      canCreateExercise
      backHref="/seances"
    />
  );
}
