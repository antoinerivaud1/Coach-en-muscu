"use client";

import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  deleteOwnSession,
  deleteRecapSet,
  updateRecapSet,
  type ScreenWriteResult,
} from "@/lib/data/sessionWrites";
import type { RecapData } from "@/lib/data/sessionDetail";
import {
  invalidateSessions,
  invalidateSessionsAfterDelete,
} from "@/hooks/data/useSessionScreen";
import { formatDateLong, formatWeight } from "@/lib/utils/training";
import { sessionPath } from "@/lib/routes";
import { memberAccent, sessionExerciseLabel } from "@/lib/members";
import { memberStyle } from "@/lib/duo";
import ConfirmSubmit from "@/components/ConfirmSubmit";
import PendingSetsSync from "./PendingSetsSync";

const FEEDBACK_LABELS: Record<string, string> = {
  easy: "Facile",
  normal: "Normal",
  hard: "Dur",
  failure: "Échec",
};

const OFFLINE_TEXT = "Pas de connexion. Réessaie dans un instant.";

/**
 * Récap d'une séance terminée (lecture), avec pour mes séances « Corriger les
 * séries » (`?editsets=1`), « Modifier » (`?edit=1`, rouvre la saisie) et
 * « Supprimer ».
 *
 * CM-88 (PR 6) : écritures depuis le navigateur. Une erreur s'affiche ici,
 * au lieu de renvoyer vers l'accueil comme le faisaient les server actions.
 */
export default function SessionRecap({
  data,
  profileId,
  editSets,
}: {
  data: RecapData;
  profileId: string;
  editSets: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  /** Garde synchrone : deux taps dans la même image passeraient l'état. */
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  /** Série dont la suppression attend confirmation (règle : toute suppression se confirme). */
  const [confirmSetId, setConfirmSetId] = useState<string | null>(null);
  // Sortie de « Corriger les séries » : une confirmation laissée ouverte ne
  // doit pas réapparaître au retour dans ce mode.
  if (!editSets && confirmSetId !== null) setConfirmSetId(null);
  const { sessionId, isMine } = data;

  function lock(): boolean {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    return true;
  }
  function unlock(): void {
    busyRef.current = false;
    setBusy(false);
  }

  /** Une écriture à la fois ; relecture de la séance (et des listes) ensuite. */
  async function write(run: () => Promise<ScreenWriteResult>): Promise<boolean> {
    if (!lock()) return false;
    setError(null);
    try {
      const result = await run();
      if (!result.ok) setError(result.error);
      await invalidateSessions(queryClient, profileId);
      return result.ok;
    } catch {
      setError(OFFLINE_TEXT);
      return false;
    } finally {
      unlock();
    }
  }

  function onUpdateSet(setId: string) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      void write(() =>
        updateRecapSet(getSupabaseBrowserClient(), {
          setId,
          sessionId,
          weightText: String(form.get("weight") ?? ""),
          repsText: String(form.get("reps") ?? ""),
        }),
      );
    };
  }

  /** La confirmation reste affichée (« Suppression… ») jusqu'à la fin de l'écriture. */
  async function onDeleteSet(setId: string) {
    try {
      await write(() => deleteRecapSet(getSupabaseBrowserClient(), { setId, sessionId }));
    } finally {
      setConfirmSetId(null);
    }
  }

  async function onDeleteSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lock()) return;
    setError(null);
    try {
      const result = await deleteOwnSession(getSupabaseBrowserClient(), profileId, sessionId);
      if (!result.ok) {
        setError(result.error);
        unlock();
        return;
      }
      // Tout est relu sauf cet écran : la séance n'existe plus, la relire
      // afficherait « Séance introuvable » le temps de partir.
      void invalidateSessionsAfterDelete(queryClient, profileId, sessionId);
      router.replace("/history");
    } catch {
      setError(OFFLINE_TEXT);
      unlock();
    }
  }

  const durationMin = data.durationSeconds ? Math.round(data.durationSeconds / 60) : null;
  const label = (name: string | null) =>
    sessionExerciseLabel(name, { isMine, name: data.ownerName });

  return (
    <main
      className="min-h-screen p-4 pb-24 pt-[max(1rem,env(safe-area-inset-top))]"
      style={memberStyle(memberAccent({ accent_color: data.ownerAccent }))}
    >
      {/* CM-78 : séance terminée alors que des séries attendaient encore leur
          écriture. Le logger n'est plus là pour vider la file, ce composant
          prend le relais et relit le récap dès qu'elle est vide. */}
      {isMine && <PendingSetsSync profileId={profileId} sessionId={sessionId} />}
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between">
          <Link href="/history" className="text-sm text-fg-muted hover:text-fg">
            ← Historique
          </Link>
          {isMine && (
            <Link
              href={sessionPath(sessionId, { editSets: !editSets })}
              className="text-sm font-semibold text-accent"
            >
              {editSets ? "Terminer" : "Corriger les séries"}
            </Link>
          )}
        </div>

        <h1 className="mt-3 text-2xl font-bold">{data.dayName}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          {formatDateLong(data.performedAt)}
          {durationMin !== null ? ` · ${durationMin} min` : ""}
          {data.feedback ? ` · ${FEEDBACK_LABELS[data.feedback] ?? data.feedback}` : ""}
        </p>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {data.recordCount > 0 && (
          <div className="mt-4 rounded-xl bg-member/15 px-4 py-3 text-sm font-medium text-member">
            🏆 {data.recordCount} nouveau{data.recordCount > 1 ? "x" : ""} record
            {data.recordCount > 1 ? "s" : ""} sur cette séance !
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-fg-muted">Volume total</p>
            <p className="mt-1 text-lg font-bold">
              {Math.round(data.volume).toLocaleString("fr-FR")} kg
            </p>
          </div>
          <div className="rounded-xl bg-surface p-3">
            <p className="text-xs text-fg-muted">Exercices</p>
            <p className="mt-1 text-lg font-bold">{data.exercises.length}</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {data.exercises.map((ex) => (
            <section key={ex.exerciseId} className="rounded-xl bg-surface p-4">
              <div className="flex items-center justify-between">
                <h2 className={`font-semibold ${ex.name ? "" : "text-fg-muted"}`}>
                  {label(ex.name)}
                </h2>
                {ex.isRecord && (
                  <span className="rounded-full bg-member/20 px-2 py-0.5 text-xs font-medium text-member">
                    🏆 Record
                  </span>
                )}
              </div>
              <ul className="mt-2 flex flex-wrap gap-2">
                {ex.sets.map((r) =>
                  editSets && isMine && confirmSetId === r.id ? (
                    <li
                      key={`${r.id}:confirm`}
                      role="group"
                      aria-label="Confirmer la suppression de la série"
                      aria-live="polite"
                      className="flex items-center gap-2 rounded-lg bg-surface2 px-2.5 py-1.5 text-sm"
                    >
                      <span className="font-semibold text-flame">
                        Supprimer {formatWeight(r.weight_kg)} kg × {r.reps} ?
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onDeleteSet(r.id)}
                        className="rounded-lg bg-flame px-2 py-1 text-[13px] font-extrabold text-ink disabled:opacity-60"
                      >
                        {busy ? "Suppression…" : "Oui, supprimer"}
                      </button>
                      <button
                        type="button"
                        // Choix sûr par défaut : le focus va sur « Annuler ».
                        autoFocus
                        disabled={busy}
                        onClick={() => setConfirmSetId(null)}
                        className="rounded-lg bg-ink px-2 py-1 text-[13px] font-semibold text-fg"
                      >
                        Annuler
                      </button>
                    </li>
                  ) : editSets && isMine ? (
                    <li
                      key={`${r.id}:${r.weight_kg}:${r.reps}`}
                      className="flex items-center gap-2 rounded-lg bg-surface2 px-2.5 py-1.5 text-sm"
                    >
                      <form onSubmit={onUpdateSet(r.id)} className="flex items-center gap-1.5">
                        <input
                          name="weight"
                          defaultValue={formatWeight(r.weight_kg)}
                          inputMode="decimal"
                          aria-label="Poids (kg)"
                          className="w-14 rounded bg-ink px-2 py-1 text-center text-fg"
                        />
                        <span className="text-fg-muted">×</span>
                        <input
                          name="reps"
                          defaultValue={String(r.reps)}
                          inputMode="numeric"
                          aria-label="Répétitions"
                          className="w-12 rounded bg-ink px-2 py-1 text-center text-fg"
                        />
                        <button
                          type="submit"
                          disabled={busy}
                          className="rounded bg-energy px-2 py-1 font-bold text-energy-fg disabled:opacity-60"
                          aria-label="Enregistrer"
                        >
                          ✓
                        </button>
                      </form>
                      {/* Toute suppression se confirme : le ✕ ouvre « Supprimer … ? ». */}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setConfirmSetId(r.id)}
                        className="px-1 text-fg-faint hover:text-danger disabled:opacity-60"
                        aria-label={`Supprimer la série ${label(ex.name)} ${formatWeight(r.weight_kg)} kg × ${r.reps}`}
                      >
                        ✕
                      </button>
                    </li>
                  ) : (
                    <li
                      key={r.id}
                      className={`rounded-lg px-3 py-1.5 text-sm ${
                        r.is_warmup ? "bg-surface2/50 text-fg-muted" : "bg-surface2"
                      }`}
                    >
                      <span className="font-medium">{formatWeight(r.weight_kg)}</span>
                      <span className="text-fg-muted"> kg × </span>
                      <span className="font-medium">{r.reps}</span>
                      {r.is_warmup && <span className="ml-1 text-[12px] uppercase">éch.</span>}
                    </li>
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>

        {isMine && (
          <div className="mt-6 flex gap-3">
            <Link
              href={sessionPath(sessionId, { edit: true })}
              className="flex-1 rounded-lg bg-surface2 py-3 text-center text-sm font-semibold text-fg"
            >
              Modifier
            </Link>
            {/* Confirmation en ligne (pas de `window.confirm()`, supprimé en
                PWA iOS et dans Capacitor, CM-70), comme le bandeau de l'accueil
                et la feuille de sortie du logger. */}
            <form onSubmit={onDeleteSession} className="flex-1">
              <ConfirmSubmit
                message="Supprimer cette séance et ses séries ? C'est définitif."
                className="w-full rounded-lg bg-surface2 py-3 text-sm font-semibold text-danger"
              >
                Supprimer
              </ConfirmSubmit>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
