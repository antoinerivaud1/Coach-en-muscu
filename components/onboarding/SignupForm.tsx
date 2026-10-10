"use client";

import { useActionState, useState } from "react";
import { signUpWithPassword, type SignupFormState } from "@/lib/actions/signup";
import { PASSWORD_MIN_LENGTH } from "@/lib/auth/core";

/** CM-86 : formulaire « Crée ton compte » (maquette 2). */
export default function SignupForm() {
  const [state, action, pending] = useActionState<SignupFormState, FormData>(
    signUpWithPassword,
    {},
  );
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const longEnough = password.length >= PASSWORD_MIN_LENGTH;
  const emailError = state.fieldErrors?.email;
  const passwordError = state.fieldErrors?.password;
  const field =
    "h-[54px] w-full rounded-[14px] border bg-surface px-4 text-base text-fg placeholder-fg-muted focus:border-energy focus:outline-none";

  return (
    <form action={action} className="flex flex-1 flex-col" noValidate>
      <div className="mt-8 flex flex-col gap-[18px]">
        <label className="flex flex-col gap-2">
          <span className="text-[15px] font-semibold text-[#A4A4AE]">Email</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            defaultValue={state.email}
            required
            aria-invalid={emailError ? true : undefined}
            aria-describedby={emailError ? "email-error" : undefined}
            className={`${field} ${emailError ? "border-red-400/60" : "border-white/10"}`}
          />
          {emailError && (
            <span id="email-error" className="text-sm font-semibold text-red-400">
              {emailError}
            </span>
          )}
        </label>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-[15px] font-semibold text-[#A4A4AE]">
            Mot de passe
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={PASSWORD_MIN_LENGTH}
              aria-invalid={passwordError ? true : undefined}
              aria-describedby="password-hint"
              className={`${field} pr-[52px] ${passwordError ? "border-red-400/60" : "border-white/10"}`}
            />
            <button
              type="button"
              onClick={() => setVisible((v) => !v)}
              aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
              aria-pressed={visible}
              className="absolute right-[5px] top-[5px] flex h-11 w-11 items-center justify-center text-fg-muted"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
                {visible && <path d="M3 3l18 18" />}
              </svg>
            </button>
          </div>
          <span
            id="password-hint"
            className={`flex items-center gap-2 text-[15px] ${passwordError ? "font-semibold text-red-400" : "text-[#A4A4AE]"}`}
          >
            {passwordError ? (
              passwordError
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={longEnough ? "#CCFF02" : "#8C8C97"} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {PASSWORD_MIN_LENGTH}&nbsp;caractères minimum
              </>
            )}
          </span>
        </div>
      </div>

      {state.error && (
        <p role="alert" className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm font-semibold text-red-300">
          {state.error}
        </p>
      )}

      <div className="flex-1" />

      <button
        type="submit"
        disabled={pending}
        className="mt-8 h-14 w-full rounded-2xl bg-energy text-base font-extrabold text-ink disabled:opacity-60"
      >
        {pending ? "Création du compte…" : "Continuer"}
      </button>
    </form>
  );
}
