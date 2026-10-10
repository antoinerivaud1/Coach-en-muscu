import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthState } from "@/lib/profile";

export const metadata: Metadata = { title: "Bienvenue · Coach en Muscu" };

/**
 * CM-86 : écran de bienvenue (maquette 1).
 *
 * « Continuer avec Apple » et « Continuer avec Google » arrivent avec CM-96 /
 * CM-100 (connexion native) : affichés comme sur la maquette, mais désactivés
 * avec la mention « Bientôt », plutôt que masqués derrière un drapeau, pour
 * que l'écran reste fidèle et que la place soit déjà prise.
 */
function SocialButton({ label, light }: { label: string; light?: boolean }) {
  return (
    <button
      type="button"
      disabled
      aria-disabled
      aria-label={`${label} (bientôt)`}
      className={`flex h-14 w-full cursor-not-allowed items-center justify-center gap-2.5 rounded-2xl text-base font-bold ${
        light ? "bg-fg/85 text-ink" : "border border-white/15 bg-surface text-fg/85"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide ${
          light ? "bg-ink/10 text-ink" : "bg-surface2 text-fg-muted"
        }`}
      >
        Bientôt
      </span>
    </button>
  );
}

export default async function WelcomePage() {
  const { profileId } = await getAuthState();
  if (profileId) redirect("/dashboard");

  return (
    <main className="relative flex min-h-[100dvh] flex-col overflow-hidden px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      {/* Cercles décoratifs de la maquette. */}
      <div aria-hidden className="pointer-events-none absolute -right-[150px] -top-[40px] h-[340px] w-[340px] rounded-full border-2 border-energy/15" />
      <div aria-hidden className="pointer-events-none absolute -right-[90px] top-[20px] h-[220px] w-[220px] rounded-full border-2 border-energy/20" />
      <div aria-hidden className="pointer-events-none absolute -right-[30px] top-[80px] h-[100px] w-[100px] rounded-full bg-energy" />

      <div className="relative mx-auto flex w-full max-w-md flex-1 flex-col">
        <div className="mt-6 flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-energy" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0B0B0F" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6.5 6.5 11 11" /><path d="m21 21-1-1" /><path d="m3 3 1 1" /><path d="m18 22 4-4" /><path d="m2 6 4-4" /><path d="m3 10 7-7" /><path d="m14 21 7-7" />
            </svg>
          </span>
          <span className="text-base font-extrabold tracking-[0.02em] text-fg">COACH EN MUSCU</span>
        </div>

        <div className="flex-1" />

        <div className="flex flex-col gap-3.5">
          <h1 className="text-balance font-oswald text-[58px] font-bold uppercase leading-[0.95] tracking-[-0.01em] text-fg">
            Chaque série compte.
          </h1>
          <p className="text-base leading-relaxed text-[#A4A4AE]">
            Note tes séances en quelques secondes, retrouve ce que tu as soulevé la
            dernière fois et regarde ta progression monter.
          </p>
        </div>

        <div className="mt-9 flex flex-col gap-2.5">
          <SocialButton label="Continuer avec Apple" light />
          <SocialButton label="Continuer avec Google" />
          <Link
            href="/signup"
            className="flex h-14 w-full items-center justify-center rounded-2xl bg-energy text-base font-extrabold text-ink"
          >
            Créer un compte avec un email
          </Link>
          <Link
            href="/login"
            className="flex h-12 w-full items-center justify-center text-base font-semibold text-fg"
          >
            J&apos;ai déjà un compte
          </Link>
        </div>
        <p className="mt-2 text-center text-sm leading-normal text-fg-muted">
          En continuant, tu acceptes les{" "}
          <Link href="/legal/cgu" className="text-[#A4A4AE] underline underline-offset-2">
            conditions
          </Link>{" "}
          et la{" "}
          <Link href="/legal/confidentialite" className="text-[#A4A4AE] underline underline-offset-2">
            politique de confidentialité
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
