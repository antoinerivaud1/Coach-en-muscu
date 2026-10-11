"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import {
  deleteSeance,
  duplicateSeance,
  fetchSeanceEditor,
  fetchSeanceLibrary,
  moveSeance,
  saveSeance,
  type SaveSeanceInput,
  type SeanceWriteResult,
} from "@/lib/data/seances";

/**
 * CM-88 (PR 5) : séances types (bibliothèque et éditeur), lues et écrites
 * dans le navigateur. Toute écriture réussie invalide `[profileId,
 * "sessions"]` : l'accueil (grille, suggestion), la bibliothèque et
 * l'éditeur sont relus, l'accueil montre tout de suite les séances types à
 * jour.
 */

async function invalidateAfterSeanceWrite(queryClient: QueryClient, profileId: string) {
  // L'éditeur encore ouvert n'est PAS relu : sa relecture ferait sauter le
  // nom affiché (la séance enregistrée compterait parmi les noms pris, d'où
  // « … 2 ») et retarderait le retour à la bibliothèque. Il n'est jamais
  // servi depuis le cache (staleTime 0, gcTime 0) : il repart de la base à
  // la prochaine ouverture.
  const editorRoot = queryKeys.seances.editor(profileId, null).slice(0, 4);
  await queryClient.invalidateQueries({
    queryKey: queryKeys.sessions.all(profileId),
    predicate: (query) =>
      !editorRoot.every((part, i) => query.queryKey[i] === part),
  });
}

/** Bibliothèque « Mes séances » / « Nos séances ». */
export function useSeanceLibrary(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.seances.library(profileId ?? ""),
    queryFn: () => fetchSeanceLibrary(getSupabaseBrowserClient(), profileId!),
    enabled: !!profileId,
    // « Dernière fois » dépend de la fin de séance, encore une server action
    // (PR 6) qui ne peut pas invalider ce cache : relecture à chaque
    // ouverture, les données en cache s'affichent pendant ce temps. À
    // resserrer avec la PR 6.
    staleTime: 0,
  });
}

/**
 * Données de l'éditeur (`dayId` null : création). Jamais servies depuis le
 * cache : l'éditeur part d'un brouillon figé à l'ouverture, il doit partir
 * de l'état réel (noms pris, « Pour qui ? »).
 */
export function useSeanceEditor(profileId: string | null, dayId: string | null) {
  return useQuery({
    queryKey: queryKeys.seances.editor(profileId ?? "", dayId),
    queryFn: () => fetchSeanceEditor(getSupabaseBrowserClient(), profileId!, dayId),
    enabled: !!profileId,
    staleTime: 0,
    gcTime: 0,
  });
}

/** Enregistrement d'une séance type (création ou édition), RPC atomique. */
export function useSaveSeance(profileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaveSeanceInput) => saveSeance(getSupabaseBrowserClient(), input),
    onSuccess: async (result) => {
      if (!result.ok || !profileId) return;
      await invalidateAfterSeanceWrite(queryClient, profileId);
      // Mes exercices perso d'une séance du duo deviennent ceux du duo.
      await queryClient.invalidateQueries({ queryKey: queryKeys.exercises.all(profileId) });
    },
  });
}

export type SeanceLibraryAction =
  | { kind: "duplicate"; dayId: string }
  | { kind: "delete"; dayId: string; name: string }
  | { kind: "move"; dayId: string; direction: "up" | "down" };

/**
 * Actions de la bibliothèque : dupliquer, supprimer, monter / descendre.
 * `mutateAsync` se termine une fois la bibliothèque relue : l'écran affiche
 * l'état à jour dès la fin de l'action.
 */
export function useSeanceLibraryAction(profileId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (action: SeanceLibraryAction): Promise<SeanceWriteResult> => {
      const supabase = getSupabaseBrowserClient();
      switch (action.kind) {
        case "duplicate":
          return duplicateSeance(supabase, action.dayId);
        case "delete":
          return deleteSeance(supabase, action.dayId, action.name);
        case "move":
          return moveSeance(supabase, action.dayId, action.direction);
      }
    },
    onSuccess: async (result) => {
      if (!result.ok || !profileId) return;
      await invalidateAfterSeanceWrite(queryClient, profileId);
    },
  });
}
