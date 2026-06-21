import { createClient } from "@/lib/supabase/server";
import { getAllProfiles } from "@/lib/profile";
import { selectProfile } from "./actions";

function DumbbellIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="m6.5 6.5 11 11" />
      <path d="m21 21-1-1" />
      <path d="m3 3 1 1" />
      <path d="m18 22 4-4" />
      <path d="m2 6 4-4" />
      <path d="m3 10 7-7" />
      <path d="m14 21 7-7" />
    </svg>
  );
}

export default async function Home() {
  const supabase = await createClient();
  const profiles = await getAllProfiles(supabase);
  // Lui (toi / cyan) en premier, comme la maquette
  const ordered = [...profiles].sort((a, b) =>
    a.color_role === "elle" ? 1 : b.color_role === "elle" ? -1 : 0,
  );

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        {/* Wordmark */}
        <div className="mt-2 flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-energy">
            <DumbbellIcon className="h-5 w-5 text-ink" />
          </span>
          <span className="font-oswald text-sm font-bold uppercase tracking-[0.22em] text-fg">
            Coach en Muscu
          </span>
        </div>

        {/* Titre */}
        <h1 className="mt-7 text-4xl font-black leading-[0.95] tracking-tight text-fg">
          Qui s&apos;entraîne<span className="text-energy">&nbsp;?</span>
        </h1>
        <p className="mt-3 text-sm leading-snug text-fg-muted">
          Touche une photo pour commencer — pas de mot de passe.
        </p>

        {/* Cartes profil */}
        <div className="mt-6 flex flex-1 flex-col gap-3.5 pb-2">
          {ordered.map((p) => {
            const isElle = p.color_role === "elle";
            const label = isElle ? "Elle" : "Lui";
            const initial = isElle ? "E" : "L";
            return (
              <form key={p.id} action={selectProfile} className="flex flex-1">
                <input type="hidden" name="profile_id" value={p.id} />
                <button
                  type="submit"
                  className={`group relative w-full flex-1 overflow-hidden rounded-[26px] border text-left transition-transform duration-200 active:scale-[0.99] ${
                    isElle
                      ? "border-elle/30 bg-[radial-gradient(circle_at_70%_22%,#4a1530,#1c0a13)] hover:border-elle/70"
                      : "border-toi/30 bg-[radial-gradient(circle_at_70%_22%,#0e4452,#08151b)] hover:border-toi/70"
                  } hover:-translate-y-0.5`}
                >
                  {/* Lettre fantôme */}
                  <span
                    className={`pointer-events-none absolute right-3 top-0 font-oswald text-[150px] font-bold leading-none ${
                      isElle ? "text-elle/10" : "text-toi/10"
                    }`}
                  >
                    {initial}
                  </span>

                  {/* Badge rôle */}
                  <span
                    className={`absolute left-4 top-4 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] ${
                      isElle
                        ? "border-elle/30 bg-elle/15 text-elle"
                        : "border-toi/30 bg-toi/15 text-toi"
                    }`}
                  >
                    {label}
                  </span>

                  {/* Bas de carte */}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent p-5">
                    <span className="block text-2xl font-black leading-none text-fg">
                      {p.display_name}
                    </span>
                    <span className="mt-2.5 flex items-center gap-1.5 text-sm font-semibold text-fg-muted">
                      Démarrer la séance
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`h-4 w-4 ${isElle ? "text-elle" : "text-toi"}`}
                        aria-hidden
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                    </span>
                  </span>
                </button>
              </form>
            );
          })}
        </div>
      </div>
    </main>
  );
}
