"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchDashboard, purgeDashboardSessions } from "@/lib/data/dashboard";

/** CM-88 (PR 4) : données de l'accueil, lues sous RLS. */
export function useDashboard(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboard.all(profileId ?? ""),
    queryFn: () => fetchDashboard(getSupabaseBrowserClient(), profileId!),
    enabled: !!profileId,
    // CM-88 (PR 6) : toutes les écritures de séance (démarrage, séries, fin,
    // abandon, séances types) se font dans le navigateur et invalident
    // `[profileId, "sessions"]`. Réglage par défaut (30 s) : l'activité du
    // partenaire de duo arrive au plus tard au retour au premier plan.
  });
}

/**
 * Nettoyage des séances vides abandonnées (CM-83) : une ÉCRITURE, lancée une
 * fois par ouverture de l'accueil, sans bloquer l'affichage (les lectures
 * partent en parallèle). S'il a supprimé quelque chose, l'accueil est relu.
 *
 * Le bandeau ne propose déjà jamais une séance vide de plus de 2 h
 * (`resumeBannerState`) : lire avant la fin du nettoyage n'affiche donc rien
 * de faux. Une erreur est ignorée, comme avant (nettoyage opportuniste).
 */
export function usePurgeAbandonedSessions(profileId: string | null) {
  const queryClient = useQueryClient();
  const { mutate } = useMutation({
    mutationFn: (id: string) => purgeDashboardSessions(getSupabaseBrowserClient(), id),
    onSuccess: (purged, id) => {
      if (purged > 0) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all(id) });
      }
    },
  });

  // Une seule fois par montage et par profil : le ref survit au double effet
  // du mode strict et aux nouveaux rendus, donc aucune boucle.
  const doneFor = useRef<string | null>(null);
  useEffect(() => {
    if (!profileId || doneFor.current === profileId) return;
    doneFor.current = profileId;
    mutate(profileId);
  }, [profileId, mutate]);
}
