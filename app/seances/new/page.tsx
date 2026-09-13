import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId } from "@/lib/profile";
import { getCatalogExercises } from "@/lib/queries/exercises";
import type { SystemExercise } from "@/lib/queries/exercises";
import {
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
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const coupleId = await getCoupleId(supabase, profileId);
  if (!coupleId) {
    return (
      <main className="min-h-screen p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-16 text-center">
          <p className="text-sm text-fg-muted">
            Cette fonctionnalité nécessite un couple.
          </p>
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

  const { data: catalogData } = await getCatalogExercises(supabase, coupleId);
  const catalog: SystemExercise[] = catalogData ?? [];

  const sharedProgramId = await getSharedProgramId(supabase, coupleId);
  const siblings = sharedProgramId
    ? await getProgramDayNames(supabase, sharedProgramId)
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
