"use client";

import { useState } from "react";
import { deliverExport } from "@/lib/export/deliverExport";
import { buildAccountExportZip } from "@/lib/data/accountExport";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export const EXPORT_ERROR_MESSAGE =
  "L'export n'a pas pu être préparé. Vérifie ta connexion, puis réessaie.";

function clickDownloadLink(href: string, fileName: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * CM-60 : « Exporter mes données ». Le fichier est préparé puis remis par la
 * feuille de partage du système, ou téléchargé (lib/export/deliverExport.ts).
 * CM-88 : le ZIP est construit dans le navigateur, sous RLS.
 * `variant` : ligne du Profil, ou bouton de la feuille de suppression.
 */
export default function ExportButton({
  variant,
  profileId,
}: {
  variant: "row" | "sheet";
  profileId: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await deliverExport({
        buildZip: (now) => buildAccountExportZip(getSupabaseBrowserClient(), profileId, now),
        navigator: window.navigator,
        createObjectURL: (blob) => URL.createObjectURL(blob),
        revokeObjectURL: (url) => URL.revokeObjectURL(url),
        clickDownloadLink,
      });
    } catch {
      setError(EXPORT_ERROR_MESSAGE);
    } finally {
      setPending(false);
    }
  }

  const icon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 flex-none" aria-hidden>
      <path d="M12 4v11" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 20h14" />
    </svg>
  );
  const alert = error && (
    <p
      role="alert"
      className="rounded-xl border border-red-400/40 bg-red-400/10 px-3 py-2.5 text-base text-red-300"
    >
      {error}
    </p>
  );

  if (variant === "sheet") {
    return (
      <>
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          aria-busy={pending}
          className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-energy/40 text-[17px] font-bold text-energy disabled:opacity-60"
        >
          {icon}
          {pending ? "Préparation…" : "Exporter mes données"}
        </button>
        {alert}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending}
        className="flex min-h-[64px] w-full items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:border-white/20 disabled:opacity-60"
      >
        <span className="flex-1">
          <span className="block font-extrabold text-fg">
            {pending ? "Préparation de l'export…" : "Exporter mes données"}
          </span>
          <span className="mt-0.5 block text-xs font-semibold text-fg-muted">
            Séances et séries pour tableur, et tout le reste, en un fichier
          </span>
        </span>
        <span className="text-fg-muted">{icon}</span>
      </button>
      {alert}
    </>
  );
}
