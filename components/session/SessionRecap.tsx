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
import { memberAccent, sessionExerciseLabel } from "@/lib/members";
import { memberStyle } from "@/lib/duo";
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

  function onDeleteSet(setId: string) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      void write(() => deleteRecapSet(getSupabaseBrowserClient(), { setId, sessionId }));
    };
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
      className="min-h-screen p-4 pb-24"
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
              href={editSets ? `/sessions/${sessionId}` : `/sessions/${sessionId}?editsets=1`}
              className="text-sm font-semibold text-energy"
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
            className="mt-4 rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
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
                  editSets && isMine ? (
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
                          className="rounded bg-energy px-2 py-1 font-bold text-ink disabled:opacity-60"
                          aria-label="Enregistrer"
                        >
                          ✓
                        </button>
                      </form>
                      <form onSubmit={onDeleteSet(r.id)}>
                        <button
                          type="submit"
                          disabled={busy}
                          className="px-1 text-fg-faint hover:text-red-400 disabled:opacity-60"
                          aria-label="Supprimer"
                        >
                          ✕
                        </button>
                      </form>
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
              href={`/sessions/${sessionId}?edit=1`}
              className="flex-1 rounded-lg bg-surface2 py-3 text-center text-sm font-semibold text-fg"
            >
              Modifier
            </Link>
            <form onSubmit={onDeleteSession} className="flex-1">
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-surface2 py-3 text-sm font-semibold text-red-400 disabled:opacity-60"
              >
                Supprimer
              </button>
            </form>
          </div>
        )}
      </div>
    </main>
  );
}
