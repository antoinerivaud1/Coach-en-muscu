import { createClient } from "@/lib/supabase/server";
import { getAllProfiles } from "@/lib/profile";
import { selectProfile } from "./actions";
import OnboardingPhoto from "@/components/OnboardingPhoto";

export default async function Home() {
  const supabase = await createClient();
  const profiles = await getAllProfiles(supabase);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <h1 className="text-center text-3xl font-bold">Coach en Muscu</h1>
        <p className="mt-2 text-center text-zinc-400">Qui s&apos;entraîne ?</p>

        <div className="mt-8 space-y-3">
          {profiles.map((p) => {
            const isElle = p.color_role === "elle";
            return (
              <form key={p.id} action={selectProfile}>
                <input type="hidden" name="profile_id" value={p.id} />
                <button
                  type="submit"
                  className={`flex w-full items-center gap-4 rounded-2xl border-2 p-5 text-left transition-colors ${
                    isElle
                      ? "border-elle/40 bg-elle/10 hover:bg-elle/20"
                      : "border-toi/40 bg-toi/10 hover:bg-toi/20"
                  }`}
                >
                  <span
                    className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl ${
                      isElle ? "bg-elle text-white" : "bg-toi text-white"
                    }`}
                    aria-hidden
                  >
                    {isElle ? "🤸‍♀️" : "🏋️‍♂️"}
                  </span>
                  <span className="text-lg font-semibold">
                    {p.display_name}
                  </span>
                </button>
              </form>
            );
          })}
        </div>

        <OnboardingPhoto />

        <p className="mt-8 text-center text-xs text-zinc-600">
          Pas de mot de passe : choisis simplement ton profil.
        </p>
      </div>
    </main>
  );
}
