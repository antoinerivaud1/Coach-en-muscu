import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireProfileId, getCoupleId, getCoupleProfileIds } from "@/lib/profile";
import { getProgramWithDays } from "@/lib/queries/programs";
import type { ProgramFull } from "@/lib/queries/programs";
import BackButton from "@/components/BackButton";
import ProgramMetaForm from "./ProgramMetaForm";

/**
 * Édition d'un programme : son nom et sa portée, pré-remplis.
 *
 * CM-70 : cette page montait l'assistant 4 étapes de `/programs/new`. Même
 * pré-rempli, il se présentait comme le parcours de création et gérait aussi
 * les séances — alors que depuis CM-65 celles-ci appartiennent à la
 * bibliothèque de `/programs/[id]`. Pire, son action `updateProgram` supprime
 * toute séance absente de sa liste : passer par « Modifier » pouvait détruire
 * le travail fait dans la bibliothèque. L'assistant reste réservé à la
 * création.
 */
export default async function EditProgramPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profileId = await requireProfileId();
  const supabase = await createClient();

  const { data } = await getProgramWithDays(supabase, id);
  const program = data as ProgramFull | null;
  if (!program) {
    notFound();
  }

  const coupleId = await getCoupleId(supabase, profileId);
  const partnerIds = coupleId
    ? (await getCoupleProfileIds(supabase, coupleId)).filter(
        (pid) => pid !== profileId,
      )
    : [];

  return (
    <main className="min-h-screen p-4">
      <div className="mx-auto max-w-lg">
        <div className="mb-2">
          <BackButton fallback={`/programs/${id}`} />
        </div>
        <ProgramMetaForm
          programId={id}
          initialName={program.name}
          initialScope={program.couple_id ? "couple" : "individual"}
          hasCouple={partnerIds.length > 0}
          seanceCount={program.program_days.length}
        />
      </div>
    </main>
  );
}
