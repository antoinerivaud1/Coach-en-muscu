"use client";

import { useActionState } from "react";
import {
  createPasswordForCurrentProfile,
  type AuthFormState,
} from "@/lib/actions/auth";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/core";
import AuthField from "@/components/AuthField";

// CM-58 : bloc « Créer mon mot de passe » de l'écran Profil (mode `hybrid`).
export default function CreatePasswordForm({ defaultEmail }: { defaultEmail: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(
    createPasswordForCurrentProfile,
    { email: defaultEmail },
  );

  return (
    <section className="mt-6 rounded-2xl border border-energy/30 bg-energy/5 p-4">
      <div className="text-[13px] font-extrabold uppercase tracking-[0.14em] text-energy">
        Créer mon mot de passe
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        Bientôt, l&apos;app demandera de se connecter. Crée ton accès maintenant : tes séances
        restent les mêmes.
      </p>
      <form action={action} className="mt-4 flex flex-col gap-4" noValidate>
        <AuthField
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={state.email ?? defaultEmail}
          error={state.fieldErrors?.email}
        />
        <AuthField
          label={`Mot de passe (${PASSWORD_MIN_LENGTH} caractères min.)`}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          error={state.fieldErrors?.password}
        />
        <AuthField
          label="Confirmer le mot de passe"
          name="confirm"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          error={state.fieldErrors?.confirm}
        />
        {state.error && (
          <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-300">
            {state.error}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-2xl bg-energy py-3.5 text-sm font-extrabold text-ink transition-opacity disabled:opacity-60"
        >
          {pending ? "Création…" : "Créer mon mot de passe"}
        </button>
      </form>
    </section>
  );
}
