import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createCoupleAction, joinCoupleAction } from "./actions";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: existingMember } = await supabase
    .from("couple_members")
    .select("couple_id")
    .eq("profile_id", user.id)
    .maybeSingle();

  if (existingMember) redirect("/dashboard");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-5">
        <h1 className="text-center text-2xl font-bold">
          Configurer ton couple
        </h1>

        {params.error ? (
          <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {params.error}
          </p>
        ) : null}

        <form action={createCoupleAction} className="space-y-3 rounded-lg bg-zinc-900 p-4">
          <h2 className="font-semibold">Creer un nouveau couple</h2>
          <p className="text-sm text-zinc-400">
            Tu seras le premier membre. Tu pourras inviter ton/ta partenaire
            avec ton code couple ensuite.
          </p>
          <input
            type="text"
            name="couple_name"
            placeholder="Nom du couple (optionnel)"
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-toi"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-toi px-4 py-2 font-medium text-zinc-950 transition hover:bg-toi/90"
          >
            Creer
          </button>
        </form>

        <div className="text-center text-sm text-zinc-500">ou</div>

        <form action={joinCoupleAction} className="space-y-3 rounded-lg bg-zinc-900 p-4">
          <h2 className="font-semibold">Rejoindre un couple existant</h2>
          <p className="text-sm text-zinc-400">
            Demande a ton/ta partenaire son code couple.
          </p>
          <input
            type="text"
            name="couple_id"
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            required
            pattern="[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"
            className="w-full rounded-lg bg-zinc-800 px-3 py-2 font-mono text-sm text-zinc-50 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-elle"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-elle px-4 py-2 font-medium text-zinc-950 transition hover:bg-elle/90"
          >
            Rejoindre
          </button>
        </form>
      </div>
    </main>
  );
}
