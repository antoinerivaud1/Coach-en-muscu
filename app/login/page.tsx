import Link from "next/link";
import { signIn } from "@/app/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={signIn} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Connexion</h1>
        {params.error ? (
          <p className="rounded-lg bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {params.error}
          </p>
        ) : null}
        <input
          type="email"
          name="email"
          placeholder="Email"
          required
          autoComplete="email"
          className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-toi"
        />
        <input
          type="password"
          name="password"
          placeholder="Mot de passe"
          required
          minLength={6}
          autoComplete="current-password"
          className="w-full rounded-lg bg-zinc-800 px-3 py-2 text-zinc-50 placeholder-zinc-500 outline-none focus:ring-2 focus:ring-toi"
        />
        <button
          type="submit"
          className="w-full rounded-lg bg-toi px-4 py-2 font-medium text-zinc-950 transition hover:bg-toi/90"
        >
          Se connecter
        </button>
        <p className="text-center text-sm text-zinc-400">
          Pas de compte ?{" "}
          <Link href="/signup" className="text-toi hover:underline">
            Creer un compte
          </Link>
        </p>
      </form>
    </main>
  );
}
