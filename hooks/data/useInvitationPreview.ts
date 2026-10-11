"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchInvitationPreview } from "@/lib/data/duo";
import { isValidInviteCode } from "@/lib/duo";

/**
 * CM-88 (PR 7) : aperçu d'une invitation (écran de confirmation).
 *
 * Toujours relu à l'ouverture de l'écran, jamais servi depuis le cache :
 * CM-102 exige un aperçu réussi juste avant `accept_duo_invitation`, et
 * l'invitation a pu être annulée ou acceptée entre-temps. Pas de relecture
 * au retour au premier plan : chaque code faux est compté en base (limite
 * d'essais), on n'en ajoute pas sans action de l'utilisateur.
 */
export function useInvitationPreview(profileId: string | null, code: string) {
  return useQuery({
    queryKey: queryKeys.duoInvitation.preview(profileId ?? "", code),
    queryFn: () => fetchInvitationPreview(getSupabaseBrowserClient(), code),
    enabled: !!profileId && isValidInviteCode(code),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
}
