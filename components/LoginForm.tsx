"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { signInWithEmail, type AuthFormState } from "@/lib/data/auth";
import AuthField from "@/components/AuthField";

/**
 * CM-58 : formulaire de connexion email + mot de passe. CM-88 (PR 7) :
 * connexion depuis le navigateur (lib/data/auth.ts), puis destination par
 * RECHARGEMENT COMPLET (cache du navigateur neuf). `onStart` : prévient
 * l'écran qu'une connexion part (il cesse alors de rediriger lui-même).
 */
export default function LoginForm({ next, onStart }: { next: string; onStart?: () => void }) {
  const [state, setState] = useState<AuthFormState>({});
  const [busy, setBusy] = useState(false);
  // Le rechargement prend un instant : le bouton reste occupé jusque-là.
  const pending = busy || Boolean(state.redirectTo);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    onStart?.();
    const result = await signInWithEmail(getSupabaseBrowserClient(), {
      email: String(data.get("email") ?? ""),
      password: String(data.get("password") ?? ""),
      next,
    });
    setState(result);
    if (result.redirectTo) {
      window.location.assign(result.redirectTo);
      return;
    }
    // Échec : mot de passe vidé, email gardé (comme l'ancien formulaire).
    const password = form.elements.namedItem("password");
    if (password instanceof HTMLInputElement) password.value = "";
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <AuthField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.email}
        error={state.fieldErrors?.email}
        autoFocus
      />
      <AuthField
        label="Mot de passe"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />
      {state.error && (
        <p role="alert" className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm font-semibold text-danger-soft">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-1 w-full rounded-2xl bg-energy py-4 font-oswald text-lg font-bold uppercase tracking-[0.08em] text-energy-fg transition-opacity disabled:opacity-60"
      >
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
