"use client";

import { useState } from "react";
import { inviteJoinPath } from "@/lib/duo";

/**
 * CM-87 : « Partager » (feuille de partage du téléphone, sinon copie du
 * lien) et « Copier le code ».
 */
export default function ShareInvitation({
  code,
  inviterName,
}: {
  code: string;
  inviterName: string;
}) {
  const [feedback, setFeedback] = useState<string | null>(null);

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(done);
    } catch {
      setFeedback(`Copie impossible : note le code ${code}.`);
    }
  }

  async function share() {
    const url = `${window.location.origin}${inviteJoinPath(code)}`;
    const text = `${inviterName} t'invite à s'entraîner en duo sur Coach en Muscu. Code : ${code}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Coach en Muscu", text, url });
        return;
      } catch (e) {
        // Partage annulé par l'utilisateur : rien à faire.
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    await copy(url, "Lien copié, colle-le dans un message.");
  }

  return (
    <div className="mt-3">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={share}
          className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-energy text-[17px] font-extrabold text-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <path d="m16 6-4-4-4 4" />
            <path d="M12 2v13" />
          </svg>
          Partager
        </button>
        <button
          type="button"
          onClick={() => copy(code, "Code copié.")}
          className="flex h-[52px] items-center justify-center gap-2 rounded-2xl border border-white/[0.12] text-[17px] font-bold text-fg"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          Copier le code
        </button>
      </div>
      <p aria-live="polite" className="mt-2 min-h-[22px] text-center text-sm text-fg-muted">
        {feedback}
      </p>
    </div>
  );
}
