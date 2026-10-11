"use client";

import Link from "next/link";
import { useRequireProfileId } from "@/hooks/useProfileId";
import { useSeanceEditor } from "@/hooks/data/useSeances";
import { useCatalogExercises } from "@/hooks/data/useCatalogExercises";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";
import { DUO_READ_ERROR_MESSAGE } from "@/lib/duoMembership";
import SeanceBuilder from "./SeanceBuilder";

/**
 * Création (`dayId` null) ou édition d'une séance type (CM-81) : le MÊME
 * écran, pré-rempli en édition.
 *
 * CM-88 (PR 5) : écran client. Session lue dans le navigateur, séance,
 * noms déjà pris, choix « Pour qui ? » et catalogue lus sous RLS. Aucun
 * programme n'est créé ici : `save_seance` s'en charge à l'enregistrement.
 * Une séance inexistante ou inaccessible affiche « Séance introuvable »,
 * rien ne révèle qu'elle existe chez un autre couple (CM-80).
 */
export default function SeanceEditorScreen({ dayId }: { dayId: string | null }) {
  const path = dayId ? `/seances/${dayId}/edit` : "/seances/new";
  const auth = useRequireProfileId(path);
  const profileId = auth.profileId;
  const editor = useSeanceEditor(profileId, dayId);
  const catalog = useCatalogExercises(profileId);

  const error = auth.error ?? (editor.data ? null : editor.error) ?? (catalog.data ? null : catalog.error);
  if (error) {
    return (
      <EditorFrame>
        <ScreenError
          onRetry={() => {
            void auth.refetch();
            void editor.refetch();
            void catalog.refetch();
          }}
        />
      </EditorFrame>
    );
  }
  if (!profileId || !editor.data || !catalog.data) {
    return (
      <EditorFrame>
        <ScreenSkeleton label="Chargement de la séance" />
      </EditorFrame>
    );
  }

  const data = editor.data;
  if (data.kind === "duoError") {
    // C3 : duo illisible, jamais de séance rangée en perso par erreur.
    return (
      <main className="min-h-screen p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-16 text-center">
          <p
            role="alert"
            className="rounded-lg border border-red-400/40 bg-red-400/10 px-3 py-2 text-sm text-red-400"
          >
            {DUO_READ_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            onClick={() => void editor.refetch()}
            className="rounded-xl bg-energy px-4 py-2.5 text-sm font-extrabold text-ink"
          >
            Réessayer
          </button>
          <Link
            href="/seances"
            className="rounded-xl bg-surface2 px-4 py-2.5 text-sm font-semibold text-fg"
          >
            Retour à mes séances
          </Link>
        </div>
      </main>
    );
  }
  if (data.kind === "notFound") {
    return (
      <main className="min-h-screen p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4 pt-16 text-center">
          <h1 className="text-xl font-extrabold text-fg">Séance introuvable</h1>
          <p className="text-sm text-fg-muted">
            Cette séance n&apos;existe pas ou n&apos;est pas accessible depuis ton compte.
          </p>
          <Link
            href="/seances"
            className="rounded-xl bg-surface2 px-4 py-2.5 text-sm font-semibold text-fg"
          >
            Retour à mes séances
          </Link>
        </div>
      </main>
    );
  }

  return (
    <SeanceBuilder
      // Nouvelle instance si la séance change (brouillon repris de zéro).
      key={data.dayId ?? "new"}
      profileId={profileId}
      mode={data.dayId ? "edit" : "create"}
      dayId={data.dayId}
      initialName={data.initialName}
      initialExercises={data.initialExercises}
      otherNames={data.otherNames}
      owner={data.owner}
      catalog={catalog.data}
      canCreateExercise
      backHref="/seances"
    />
  );
}

function EditorFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-lg px-4 pt-14">{children}</div>
    </main>
  );
}
