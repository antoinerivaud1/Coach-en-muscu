import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSystemExercises } from "@/lib/queries/exercises";
import type { SystemExercise } from "@/lib/queries/exercises";
import ProgramForm from "./ProgramForm";

export default async function NewProgramPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect("/login");
  }

  const memberResult = await supabase
    .from("couple_members")
    .select("couple_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (!memberResult.data) {
    redirect("/onboarding");
  }

  const coupleId = memberResult.data.couple_id;

  const { data: partnersData } = await supabase
    .from("couple_members")
    .select("profile_id")
    .eq("couple_id", coupleId)
    .neq("profile_id", user.id);

  const hasCouple = (partnersData?.length ?? 0) > 0;

  const { data: exercisesData } = await getSystemExercises(supabase);
  const exercises: SystemExercise[] = exercisesData ?? [];

  return <ProgramForm exercises={exercises} hasCouple={hasCouple} />;
}
