"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { INVITE_CODE_LENGTH, isValidInviteCode, normalizeInviteCode } from "@/lib/duo";

/**
 * CM-87 : saisie du code à 6 caractères (maquette 8). Un seul vrai champ
 * (clavier, collage, saisie automatique), dessiné en 6 cases.
 */
export default function JoinCodeForm({
  initialCode,
  error,
}: {
  initialCode: string;
  error: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState(normalizeInviteCode(initialCode));
  const [focused, setFocused] = useState(false);
  const complete = isValidInviteCode(code);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!complete) return;
    router.push(`/duo/rejoindre/confirmer?code=${code}`);
  }

  const cells = Array.from({ length: INVITE_CODE_LENGTH }, (_, i) => code[i] ?? "");
  const activeIndex = Math.min(code.length, INVITE_CODE_LENGTH - 1);

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <label htmlFor="code" className="sr-only">
        Code d&apos;invitation
      </label>
      <div className="relative mt-7" onClick={() => inputRef.current?.focus()}>
        <div className="grid grid-cols-6 gap-2" aria-hidden>
          {cells.map((c, i) => (
            <span
              key={i}
              className={`flex h-[62px] items-center justify-center rounded-[14px] bg-surface font-oswald text-[30px] font-bold text-fg ${
                focused && i === activeIndex
                  ? "border-[1.5px] border-energy"
                  : "border border-white/10"
              }`}
            >
              {c}
            </span>
          ))}
        </div>
        <input
          ref={inputRef}
          id="code"
          name="code"
          value={code}
          onChange={(e) => setCode(normalizeInviteCode(e.target.value))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={12}
          aria-invalid={Boolean(error)}
          aria-describedby="code-aide"
          className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0"
        />
      </div>
      <p id="code-aide" className="mt-3 text-balance text-[15px] leading-snug text-fg-muted">
        Lettres et chiffres, sans 0, O, 1 ni I pour éviter les confusions.
      </p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-base text-red-300">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-start gap-3 rounded-[18px] border border-line bg-surface px-4 py-3.5">
        <svg viewBox="0 0 24 24" fill="none" stroke="#8C8C97" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-5 w-5 flex-none" aria-hidden>
          <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
          <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
        </svg>
        <span className="text-balance text-[15px] leading-snug text-[#C9C9D1]">
          Tu as reçu un lien&nbsp;? Ouvre-le sur ce téléphone&nbsp;: le code est rempli tout seul.
        </span>
      </div>

      <div className="flex-1" />

      <button
        type="submit"
        disabled={!complete}
        className="mt-6 h-14 rounded-2xl bg-energy text-[17px] font-extrabold text-ink disabled:opacity-40"
      >
        Valider le code
      </button>
    </form>
  );
}
