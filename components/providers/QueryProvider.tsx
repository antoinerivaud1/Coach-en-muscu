"use client";

import { useEffect, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";

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
 * Changement de session (connexion, déconnexion, autre compte) : tout le cache
 * est vidé, jamais de données d'un compte affichées à un autre.
 */
export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
          mutations: { retry: 0 },
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
      } else {
        void client.invalidateQueries({ queryKey: queryKeys.auth() });
      }
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
