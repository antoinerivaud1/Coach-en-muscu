"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  closeStaleSession,
  deleteOwnSession,
  type ScreenWriteResult,
} from "@/lib/data/sessionWrites";
import { invalidateSessions } from "@/hooks/data/useSessionScreen";
import { sessionPath } from "@/lib/routes";

/**
 * Bandeau « Séance en cours » de l'accueil (CM-83).
 *
 * Depuis CM-78 une séance interrompue reste en cours indéfiniment : rien, sur
 * l'accueil, ne disait qu'elle existait ni comment y revenir. Ce bandeau prend
 * la place de la ligne « Suggestion » — suggérer une autre séance quand une
 * séance est ouverte n'a pas de sens — sans jamais rien verrouiller : la grille
 * en dessous reste tapable, démarrer une nouvelle séance est toujours possible.
 *
 * `stale` (séance avec séries, oubliée depuis plus de 12 h) ajoute deux issues :
 * clôturer sans rouvrir le logger, ou supprimer. La suppression demande une
 * confirmation en ligne via `ConfirmSubmit` : `window.confirm()` est supprimé en
 * PWA iOS standalone (CM-70).
 *
 * CM-88 (PR 6) : « Terminer » et « Supprimer » s'écrivent depuis le
 * navigateur. En cas de succès, les séances sont relues (le bandeau
 * disparaît) ; en cas d'échec, le message s'affiche dans le bandeau.
 */
export default function ResumeSessionBanner({
  profileId,
  sessionId,
  dayName,
  setCount,
  stale,
}: {
  profileId: string;
  sessionId: string;
  dayName: string;
  setCount: number;
  stale: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  /** Garde synchrone : deux taps dans la même image passeraient l'état. */
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const run =
    (write: () => Promise<ScreenWriteResult>) => async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const result = await write();
        if (!result.ok) setError(result.error);
        // Succès comme échec (séance déjà supprimée ailleurs…) : relecture.
        await invalidateSessions(queryClient, profileId);
      } catch {
        setError("Pas de connexion. Réessaie dans un instant.");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    };

  const setsLabel =
    setCount === 0 ? "Aucune série" : `${setCount} série${setCount > 1 ? "s" : ""}`;

  return (
    <section className="mt-5 rounded-[18px] border border-energy/30 bg-energy/10 px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        {/* CM-101 : libellé au-dessus du nom, sinon le nom de séance est tronqué
            avec la nouvelle taille de texte. */}
        <div className="min-w-0 flex-1">
          <span className="block text-[12px] font-extrabold uppercase tracking-[0.12em] text-energy">
            Séance en cours
          </span>
          <span className="block truncate text-sm font-extrabold text-fg">
            {dayName}
            <span className="text-fg-muted"> · {setsLabel}</span>
          </span>
        </div>
        <Link
          href={sessionPath(sessionId)}
          className="shrink-0 rounded-xl bg-energy px-3 py-1.5 text-[15px] font-extrabold text-ink"
        >
          Reprendre
        </Link>
      </div>

      {stale && (
        <div className="mt-2.5 border-t border-energy/20 pt-2.5">
          <p className="text-[13px] font-semibold text-fg-muted">
            Séance ouverte depuis plus de 12 h. Tu peux la reprendre, l&apos;enregistrer
            telle quelle ou la supprimer.
          </p>
          <div className="mt-2 flex items-start gap-2">
            <form
              onSubmit={run(() =>
                closeStaleSession(getSupabaseBrowserClient(), profileId, sessionId),
              )}
              className="flex-1"
            >
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-surface2 py-2 text-xs font-bold text-fg"
              >
                Terminer
              </button>
            </form>
            <form
              onSubmit={run(() =>
                deleteOwnSession(getSupabaseBrowserClient(), profileId, sessionId),
              )}
              className="flex-1"
            >
              <ConfirmSubmit
                message="Supprimer cette séance et ses séries ? C'est définitif."
                className="w-full rounded-lg bg-surface2 py-2 text-xs font-bold text-flame"
              >
                Supprimer
              </ConfirmSubmit>
            </form>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-xs font-semibold text-flame">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
