"use client";

import { useState } from "react";
import Link from "next/link";
import { daysSince, formatLastDone } from "@/lib/utils/recommendation";
import { seanceEditPath } from "@/lib/routes";
import type { SeanceView, SeanceWriteResult } from "@/lib/data/seances";
import { useSeanceLibraryAction, type SeanceLibraryAction } from "@/hooks/data/useSeances";
import { useOnline } from "@/hooks/useOnline";
import { memberCss } from "@/lib/members";

export type { SeanceExerciseView, SeanceView } from "@/lib/data/seances";

/**
 * Au-delà de ce nombre de jours, la « dernière fois » passe en orange : la
 * séance commence à dater (maquette CM-81).
 */
const STALE_DAYS = 5;

/**
 * Bibliothèque « Mes séances ».
 *
 * CM-88 (PR 5) : écrans client. Dupliquer, supprimer, monter / descendre
 * écrivent depuis le navigateur (`useSeanceLibraryAction`), « Démarrer »
 * aussi (`onStart`, `useStartSession` de l'accueil). `now` vient de l'écran
 * (heure du rendu), commun aux deux sections.
 *
 * CM-104 : `shareWith` (partenaire présent, section « Mes séances » en duo
 * seulement) ajoute « Partager avec [prénom] » sous chaque carte, avec une
 * confirmation dans le DOM. Absent en solo et sur « Nos séances » : cartes
 * inchangées.
 */
export type ShareTarget = {
  /** Prénom du partenaire, ou « ton partenaire » si son profil est illisible. */
  name: string;
  color: string;
};

/** Début de phrase : « ton partenaire » devient « Ton partenaire ». */
function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type Confirming = { id: string; kind: "delete" | "share" } | null;

export default function SeanceLibrary({
  seances,
  now,
  profileId,
  onStart,
  shareWith,
  onShared,
}: {
  seances: SeanceView[];
  now: Date;
  profileId: string;
  onStart: (dayId: string) => void;
  shareWith?: ShareTarget;
  /** Partage réussi : l'écran l'annonce (la carte quitte cette liste). */
  onShared?: (name: string) => void;
}) {
  const libraryAction = useSeanceLibraryAction(profileId);
  const isPending = libraryAction.isPending;
  // CM-90 (PR 3) : hors ligne, seul « Démarrer » reste actif (packs séance).
  const online = useOnline();
  const locked = isPending || !online;
  /** Erreur courante, rattachée à l'id de la séance concernée. */
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Séance dont la suppression ou le partage attend une confirmation (DOM). */
  const [confirming, setConfirming] = useState<Confirming>(null);

  function toggleConfirm(id: string, kind: "delete" | "share") {
    setErrorKey(null);
    setErrorMessage(null);
    setConfirming((prev) => (prev?.id === id && prev.kind === kind ? null : { id, kind }));
  }

  const nowDate = now;

  async function run(key: string, action: SeanceLibraryAction) {
    if (isPending) return;
    setErrorKey(null);
    setErrorMessage(null);
    setBusyId(key);
    let result: SeanceWriteResult;
    try {
      // Se termine une fois la bibliothèque relue (liste déjà à jour).
      result = await libraryAction.mutateAsync(action);
    } catch (e) {
      result = {
        ok: false,
        error: e instanceof Error ? e.message : "Une erreur est survenue. Réessaie dans un instant.",
      };
    }
    setBusyId(null);
    setConfirming(null);
    if (!result.ok) {
      setErrorKey(key);
      setErrorMessage(result.error);
    } else if (action.kind === "share") {
      onShared?.(action.name);
    }
  }

  /**
   * CM-70 : la confirmation passait par `window.confirm()`. Ce dialogue natif
   * est supprimé (et renvoie donc `false`) dans une web app iOS en
   * `display: standalone` comme dans la WKWebView Capacitor, les deux
   * contextes de cette app. `handleDelete` sortait avant même d'appeler la
   * server action : aucune requête, aucune erreur, aucun message. La
   * confirmation est désormais rendue dans le DOM (voir `confirming`).
   */
  function handleDelete(seance: SeanceView) {
    void run(seance.id, { kind: "delete", dayId: seance.id, name: seance.name });
  }

  return (
    <div className="space-y-4">
      {seances.map((seance, index) => {
        const isEmpty = seance.exerciseCount === 0;
        const busy = busyId === seance.id && isPending;
        // « Jamais faite » reste en gris : l'orange signale une séance qui
        // traîne, pas une séance qui n'a jamais été lancée.
        const stale =
          seance.lastDoneAt !== null &&
          daysSince(seance.lastDoneAt, nowDate) >= STALE_DAYS;
        return (
          <section
            key={seance.id}
            className={`rounded-2xl border p-4 ${
              isEmpty
                ? "border-dashed border-flame/40 bg-surface/60"
                : "border-line bg-surface"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-extrabold text-fg">
                  {seance.name}
                </h2>
                <p className="mt-0.5 text-xs font-semibold text-fg-muted">
                  {isEmpty
                    ? "Séance vide"
                    : `${seance.exerciseCount} exercice${
                        seance.exerciseCount > 1 ? "s" : ""
                      } · ${seance.setCount} série${seance.setCount > 1 ? "s" : ""}`}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  className={`font-oswald text-xs font-semibold ${
                    stale ? "text-flame" : "text-fg-muted"
                  }`}
                >
                  {formatLastDone(seance.lastDoneAt, nowDate)}
                </span>
                <button
                  type="button"
                  onClick={() => onStart(seance.id)}
                  disabled={isEmpty}
                  title={
                    isEmpty ? "Ajoute au moins un exercice pour démarrer" : undefined
                  }
                  className="rounded-xl bg-energy px-4 py-2 text-sm font-extrabold text-energy-fg disabled:opacity-40"
                >
                  Démarrer
                </button>
              </div>
            </div>

            {seance.tags.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {seance.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-[13px] font-bold uppercase tracking-wide text-fg-muted"
                  >
                    {tag}
                  </span>
                ))}
                {seance.extraTags > 0 && (
                  <span className="rounded-full border border-line bg-surface2 px-2.5 py-1 text-[13px] font-bold text-fg-muted">
                    +{seance.extraTags}
                  </span>
                )}
              </div>
            )}

            {isEmpty ? (
              <p className="mt-3 rounded-xl border border-flame/30 bg-flame/10 px-3 py-2 text-sm text-flame">
                Cette séance n&apos;a aucun exercice : elle ne peut pas être
                démarrée. Ajoute au moins un exercice via « Modifier ».
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {seance.exercises.map((ex) => (
                  <li
                    key={ex.id}
                    className="flex items-center justify-between gap-3 border-t border-line pt-2 text-sm first:border-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <span className="text-fg">{ex.name}</span>
                      <span className="ml-2 text-xs text-fg-muted">
                        {ex.groupLabel}
                      </span>
                    </div>
                    <span className="shrink-0 text-xs text-fg-muted">
                      {ex.targetSets}×{ex.repsMin}–{ex.repsMax}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <button
                type="button"
                onClick={() => void run(seance.id, { kind: "move", dayId: seance.id, direction: "up" })}
                disabled={index === 0 || locked}
                aria-label={`Monter la séance ${seance.name}`}
                className="rounded-lg bg-surface2 px-3 py-2 text-sm font-bold text-fg disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() =>
                  void run(seance.id, { kind: "move", dayId: seance.id, direction: "down" })
                }
                disabled={index === seances.length - 1 || locked}
                aria-label={`Descendre la séance ${seance.name}`}
                className="rounded-lg bg-surface2 px-3 py-2 text-sm font-bold text-fg disabled:opacity-30"
              >
                ↓
              </button>
              <span className="flex-1" />
              {/* Le nom se change dans l'écran de modification : plus de
                  renommage en place depuis la bibliothèque (CM-81). */}
              {online ? (
                <Link
                  href={seanceEditPath(seance.id)}
                  className="rounded-lg bg-surface2 px-3 py-2 text-sm font-semibold text-fg"
                >
                  Modifier
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="rounded-lg bg-surface2 px-3 py-2 text-sm font-semibold text-fg opacity-50"
                >
                  Modifier
                </span>
              )}
              <button
                type="button"
                onClick={() => void run(seance.id, { kind: "duplicate", dayId: seance.id })}
                disabled={locked}
                className="rounded-lg bg-surface2 px-3 py-2 text-sm font-semibold text-fg disabled:opacity-50"
              >
                {busy ? "…" : "Dupliquer"}
              </button>
              <button
                type="button"
                onClick={() => toggleConfirm(seance.id, "delete")}
                disabled={locked}
                aria-expanded={confirming?.id === seance.id && confirming.kind === "delete"}
                aria-controls={`confirm-delete-${seance.id}`}
                className="rounded-lg bg-surface2 px-3 py-2 text-sm font-semibold text-danger disabled:opacity-50"
              >
                Supprimer
              </button>
            </div>

            {shareWith && (
              <button
                type="button"
                onClick={() => toggleConfirm(seance.id, "share")}
                disabled={locked}
                aria-expanded={confirming?.id === seance.id && confirming.kind === "share"}
                aria-controls={`confirm-share-${seance.id}`}
                className="mt-2.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface2 px-3 text-[15px] font-bold text-fg disabled:opacity-50"
              >
                <span
                  aria-hidden
                  className="h-3.5 w-3.5 flex-none rounded-full"
                  style={{ background: memberCss(shareWith.color) }}
                />
                Partager avec {shareWith.name}
              </button>
            )}

            {shareWith && confirming?.id === seance.id && confirming.kind === "share" && (
              <div
                id={`confirm-share-${seance.id}`}
                className="mt-3 rounded-xl border border-accent/40 bg-energy/10 p-3"
              >
                <p className="text-balance text-sm font-semibold text-fg">
                  Partager « {seance.name} » avec {shareWith.name}&nbsp;?{" "}
                  {capitalize(shareWith.name)} pourra la voir, la lancer et la modifier.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={isPending}
                    className="min-h-11 flex-1 rounded-lg bg-surface2 text-sm font-semibold text-fg disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      void run(seance.id, { kind: "share", dayId: seance.id, name: seance.name })
                    }
                    disabled={locked}
                    className="min-h-11 flex-1 rounded-lg bg-energy text-sm font-extrabold text-energy-fg disabled:opacity-50"
                  >
                    {busy ? "Partage…" : "Oui, partager"}
                  </button>
                </div>
              </div>
            )}

            {confirming?.id === seance.id && confirming.kind === "delete" && (
              <div
                id={`confirm-delete-${seance.id}`}
                className="mt-3 rounded-xl border border-flame/40 bg-flame/10 p-3"
              >
                <p className="text-sm font-semibold text-flame">
                  Supprimer la séance « {seance.name} » ? Cette action est
                  définitive.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={isPending}
                    className="min-h-11 flex-1 rounded-lg bg-surface2 text-sm font-semibold text-fg disabled:opacity-50"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(seance)}
                    disabled={locked}
                    className="min-h-11 flex-1 rounded-lg bg-flame text-sm font-extrabold text-ink disabled:opacity-50"
                  >
                    {busy ? "Suppression…" : "Oui, supprimer"}
                  </button>
                </div>
              </div>
            )}

            {errorKey === seance.id && errorMessage && (
              <p
                role="alert"
                className="mt-2 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
              >
                {errorMessage}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
