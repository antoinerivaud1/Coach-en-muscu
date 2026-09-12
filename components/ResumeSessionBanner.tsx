import Link from "next/link";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import { closeStaleSession, discardSession } from "@/app/sessions/[id]/actions";

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
 */
export default function ResumeSessionBanner({
  sessionId,
  dayName,
  setCount,
  stale,
}: {
  sessionId: string;
  dayName: string;
  setCount: number;
  stale: boolean;
}) {
  const setsLabel =
    setCount === 0 ? "Aucune série" : `${setCount} série${setCount > 1 ? "s" : ""}`;

  return (
    <section className="mt-5 rounded-[18px] border border-energy/30 bg-energy/10 px-3.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className="shrink-0 text-[10px] font-extrabold uppercase tracking-[0.12em] text-energy">
          Séance en cours
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-fg">
          <span className="text-fg-muted">· </span>
          {dayName}
          <span className="text-fg-muted"> · {setsLabel}</span>
        </span>
        <Link
          href={`/sessions/${sessionId}`}
          className="shrink-0 rounded-xl bg-energy px-3 py-1.5 text-[13px] font-extrabold text-ink"
        >
          Reprendre
        </Link>
      </div>

      {stale && (
        <div className="mt-2.5 border-t border-energy/20 pt-2.5">
          <p className="text-[11px] font-semibold text-fg-muted">
            Séance ouverte depuis plus de 12 h. Tu peux la reprendre, l&apos;enregistrer
            telle quelle ou la supprimer.
          </p>
          <div className="mt-2 flex items-start gap-2">
            <form action={closeStaleSession} className="flex-1">
              <input type="hidden" name="session_id" value={sessionId} />
              <button
                type="submit"
                className="w-full rounded-lg bg-surface2 py-2 text-xs font-bold text-fg"
              >
                Terminer
              </button>
            </form>
            <form action={discardSession} className="flex-1">
              <input type="hidden" name="session_id" value={sessionId} />
              <ConfirmSubmit
                message="Supprimer cette séance et ses séries ? C'est définitif."
                className="w-full rounded-lg bg-surface2 py-2 text-xs font-bold text-flame"
              >
                Supprimer
              </ConfirmSubmit>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
