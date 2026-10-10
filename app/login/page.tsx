import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/profile";
import { safeNextPath } from "@/lib/auth/core";
import LoginForm from "@/components/LoginForm";

export const metadata: Metadata = { title: "Connexion · Coach en Muscu" };

// CM-58 : connexion par compte (email + mot de passe). CM-86 : lien vers
// l'écran de bienvenue (inscription, fermée tant que SIGNUP_ENABLED est off).
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { profileId } = await getAuthState();

  const { next: rawNext } = await searchParams;
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  if (profileId) redirect(next);

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

        <p className="mt-5 text-center text-base text-fg-muted">
          Pas encore de compte&nbsp;?{" "}
          <Link href="/welcome" className="inline-flex min-h-11 items-center font-bold text-energy">
            Créer un compte
          </Link>
        </p>

        {/* CM-93 : liens légaux, accessibles sans compte. */}
        <nav
          aria-label="Informations légales"
          className="mt-auto flex flex-wrap justify-center gap-x-5 gap-y-1 pt-8 text-xs font-medium text-fg-muted"
        >
          <Link href="/legal/confidentialite" className="py-1.5 underline-offset-4 hover:text-fg hover:underline">
            Confidentialité
          </Link>
          <Link href="/legal/cgu" className="py-1.5 underline-offset-4 hover:text-fg hover:underline">
            CGU
          </Link>
          <Link href="/support" className="py-1.5 underline-offset-4 hover:text-fg hover:underline">
            Support
          </Link>
        </nav>
      </div>
    </main>
  );
}
