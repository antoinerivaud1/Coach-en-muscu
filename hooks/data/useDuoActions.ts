"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient, type BrowserSupabase } from "@/lib/supabase/client";
import {
  acceptDuoInvitation,
  createDuoInvitation,
  leaveDuo,
  revokeDuoInvitation,
  type DuoWriteResult,
} from "@/lib/data/duo";

/**
 * CM-88 (PR 7) : actions du duo depuis le navigateur (remplacent les server
 * actions de lib/actions/duo.ts).
 *
 * Après coup, deux traitements selon ce que l'action change :
 * - inviter / annuler l'invitation : seul l'état du duo change (un duo en
 *   attente reste « solo » pour l'app : bibliothèque, Stats et Carnet ne
 *   bougent pas). L'état du duo en cache est EFFACÉ puis relu
 *   (`resetQueries`, attendu avant de naviguer) : aucun écran ne peut
 *   montrer, ni décider une redirection sur, l'ancien état. Navigation dans
 *   l'app, sans rechargement.
 * - rejoindre / quitter : change ce que l'on voit partout (bibliothèque
 *   commune, comparaisons de l'accueil et des Stats, nom du partenaire dans
 *   le Carnet), y compris sur des écrans encore rendus par le serveur
 *   (séances types, séances) que le cache du navigateur ne connaît pas.
 *   RECHARGEMENT COMPLET (`window.location.assign`), comme un changement de
 *   compte : cache neuf et pages serveur relues, rien de l'ancien duo ne
 *   peut rester affiché. Action rare : le coût d'un rechargement est
 *   négligeable face au risque d'un écran à moitié à jour.
 */

/** Efface l'état du duo en cache (tous profils) et relit les écrans affichés. */
function resetDuoState(queryClient: QueryClient): Promise<void> {
  return queryClient.resetQueries({
    predicate: (q) => q.queryKey[1] === "duo" && q.queryKey[2] === "state",
  });
}

function useDuoMutation<A extends unknown[]>(
  run: (supabase: BrowserSupabase, ...args: A) => Promise<DuoWriteResult>,
  after: (queryClient: QueryClient) => Promise<void> | void,
) {
  const queryClient = useQueryClient();
  // Rechargement en cours : le bouton reste occupé jusqu'au départ de la page.
  const [leaving, setLeaving] = useState(false);
  const mutation = useMutation({
    mutationFn: (args: A) => run(getSupabaseBrowserClient(), ...args),
    onSuccess: async (result) => {
      if (!result.ok) return;
      await after(queryClient);
    },
  });
  const result = mutation.data;
  return {
    run: (...args: A) => mutation.mutate(args),
    pending: mutation.isPending || leaving,
    error: result && !result.ok ? result.error : null,
    /** À appeler juste avant un rechargement complet. */
    markLeaving: () => setLeaving(true),
  };
}

/** « Inviter mon partenaire » : crée l'invitation puis ouvre l'écran de partage. */
export function useCreateInvitation() {
  const router = useRouter();
  return useDuoMutation(createDuoInvitation, async (queryClient) => {
    await resetDuoState(queryClient);
    router.push("/duo/inviter");
  });
}

/**
 * « Annuler l'invitation ». `then` : écran à ouvrir ensuite (`/profile`
 * depuis l'écran de partage) ; sans, on reste sur place (carte du Profil).
 */
export function useRevokeInvitation(then?: string) {
  const router = useRouter();
  return useDuoMutation(revokeDuoInvitation, async (queryClient) => {
    await resetDuoState(queryClient);
    if (then) router.push(then);
  });
}

/** « Rejoindre le duo » : accueil, par rechargement complet. */
export function useAcceptInvitation() {
  const m = useDuoMutation(
    (supabase, code: string, color: string | null) => acceptDuoInvitation(supabase, code, color),
    () => {
      m.markLeaving();
      window.location.assign("/dashboard");
    },
  );
  return m;
}

/** « Quitter le duo » : Profil, par rechargement complet. */
export function useLeaveDuo() {
  const m = useDuoMutation(leaveDuo, () => {
    m.markLeaving();
    window.location.assign("/profile");
  });
  return m;
}
