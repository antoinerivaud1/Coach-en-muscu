"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchHistory } from "@/lib/data/sessions";

/** CM-88 : séances terminées du Carnet (moi, plus mon partenaire en duo actif). */
export function useHistory(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.sessions.history(profileId ?? ""),
    queryFn: () => fetchHistory(getSupabaseBrowserClient(), profileId!),
    enabled: !!profileId,
    // Fin de séance, suppression et édition d'une série restent des server
    // actions (écran de séance, PR 6) : elles ne peuvent pas invalider ce
    // cache. Relecture à chaque ouverture, le Carnet en cache s'affiche
    // pendant ce temps. À resserrer quand la PR 6 invalidera
    // `queryKeys.sessions.all`.
    staleTime: 0,
  });
}
