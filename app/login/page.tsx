import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/profile";
import { safeNextPath } from "@/lib/auth/core";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = { title: "Connexion · Coach en Muscu" };

// CM-58 : connexion par compte (email + mot de passe). Pas d'inscription
// publique (CM-86) : un compte se crée depuis Profil en mode `hybrid`.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { mode, source } = await getAuthState();
  // Mode `cookie` (défaut) : la page n'existe pas encore pour l'utilisateur.
  if (mode === "cookie") redirect("/");

  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  if (source === "session") redirect(next);

  return (
    <main className="flex min-h-[100dvh] flex-col px-6 pb-7 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col">
        <div className="mt-2 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-energy font-oswald text-lg font-bold text-ink">
            C
          </span>
          <span className="font-oswald text-sm font-bold uppercase tracking-[0.22em] text-fg">
            Coach en Muscu
          </span>
        </div>

        <h1 className="mt-6 text-[40px] font-black leading-[0.95] tracking-tight text-fg">
          Connexion<span className="text-energy">.</span>
        </h1>
        <p className="mt-3 text-sm leading-snug text-fg-muted">
          Entre ton email et ton mot de passe pour retrouver tes séances.
        </p>

        <div className="mt-7">
          <LoginForm next={next} />
        </div>

        {mode === "hybrid" && (
          <Link
            href="/"
            className="mt-6 text-center text-sm font-medium text-fg-muted underline-offset-4 hover:text-fg hover:underline"
          >
            Pas encore de mot de passe ? Choisir mon profil
          </Link>
        )}
      </div>
    </main>
  );
}
