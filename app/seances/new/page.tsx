import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, readMemberProfiles, DUO_READ_ERROR_MESSAGE } from "@/lib/profile";
import { toMembers } from "@/lib/duo";
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

  // CM-86 : sans partenaire, la séance ira dans la bibliothèque perso.
  // CM-87 : en duo, choix « Pour nous deux » (défaut) / « Pour moi ».
  // C3 : duo illisible => écran d'erreur (jamais de séance rangée en perso
  // par erreur ; `saveSeance` refuse aussi).
  const read = await readMemberProfiles(supabase, profileId);
  if (!read.ok) {
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
  const { duoId, profiles } = read;
  const members = toMembers(profiles, profileId);
  const partner = members.find((m) => !m.isMe);
  const me = members.find((m) => m.isMe);

  const { data: catalogData } = await getCatalogExercises(supabase, duoId, profileId);
  const catalog: SystemExercise[] = catalogData ?? [];

  const namesOf = async (programId: string | null) => {
    if (!programId) return [];
    const siblings = await getProgramDayNames(supabase, programId);
    return siblings.ok ? siblings.days.map((d) => d.name) : [];
  };
  const persoNames = await namesOf(await getPersonalProgramId(supabase, profileId));
  const duoNames = duoId ? await namesOf(await getSharedProgramId(supabase, duoId)) : [];

  return (
    <SeanceBuilder
      mode="create"
      initialName=""
      initialExercises={[]}
      otherNames={duoId ? duoNames : persoNames}
      owner={
        duoId && partner && me
          ? {
              partnerName: partner.name,
              myColor: me.color,
              initial: "duo",
              otherNamesByTarget: { duo: duoNames, perso: persoNames },
            }
          : undefined
      }
      catalog={catalog}
      canCreateExercise
      backHref="/seances"
    />
  );
}
