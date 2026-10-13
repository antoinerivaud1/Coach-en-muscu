"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  READ_CACHE_BUSTER,
  READ_CACHE_MAX_AGE_MS,
  createReadCachePersister,
  shouldPersistQuery,
} from "@/lib/offline/readCache";

/**
 * CM-88 : cache des données côté client (TanStack Query), partagé par tous les
 * écrans convertis. Réglages :
 * - `staleTime` 30 s : revenir sur un écran ne relance pas de requête dans la
 *   foulée, mais une donnée plus ancienne est rafraîchie en arrière-plan.
 * - `retry` 1 : un réseau de salle qui hoquette a droit à un second essai,
 *   pas à une attente interminable.
 * - Les écritures invalident elles-mêmes les clés concernées (remplace
 *   `revalidatePath` des server actions).
 *
 * Changement de compte : connexion, inscription, déconnexion et suppression
 * rechargent la page entière (`window.location.assign`), donc un cache neuf. Si
 * la session change autrement (autre onglet, jeton révoqué), l'écouteur
 * ci-dessous efface les données et relance les écrans affichés.
 *
 * CM-90 (PR 3) : lecture hors ligne.
 * - `networkMode: "always"` : on tente toujours, le réseau de salle est souvent
 *   « présent mais inutilisable ». Un échec garde les données déjà affichées
 *   (bandeau « Hors ligne », components/OfflineBanner.tsx) ; un écran sans
 *   données propose « Réessayer » au lieu d'un squelette sans fin.
 * - Cache recopié dans IndexedDB et restauré au lancement
 *   (lib/offline/readCache.ts). `gcTime` aligné sur sa durée de vie : une
 *   lecture quittée reste en cache, donc dans la copie.
 */
export default function QueryProvider({ children }: { children: ReactNode }) {
  const [persister] = useState(createReadCachePersister);
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: READ_CACHE_MAX_AGE_MS,
            retry: 1,
            refetchOnWindowFocus: true,
            networkMode: "always",
          },
          mutations: { retry: 0, networkMode: "always" },
        },
      }),
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    // `undefined` : aucun événement reçu. Au démarrage, Supabase peut émettre
    // SIGNED_IN (session retrouvée) AVANT INITIAL_SESSION : le premier
    // événement, quel qu'il soit, ne fait que mémoriser le compte.
    let currentUserId: string | null | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null;
      if (currentUserId === undefined) {
        currentUserId = userId;
        return;
      }
      if (userId !== currentUserId) {
        currentUserId = userId;
        // Jamais `clear()` : il détache les écrans des requêtes en cours, qui
        // restent alors en chargement pour toujours. `resetQueries` efface les
        // données et relance les requêtes affichées ; les autres sont retirées.
        client.removeQueries({ type: "inactive" });
        void client.resetQueries();
      }
      // Même compte (jeton rafraîchi, retour au premier plan) : rien à faire.
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  if (!persister) return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: READ_CACHE_MAX_AGE_MS,
        buster: READ_CACHE_BUSTER,
        dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
