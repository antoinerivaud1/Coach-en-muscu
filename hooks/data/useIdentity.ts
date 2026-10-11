"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { fetchIdentity } from "@/lib/data/profile";

/** CM-88 : prénom, couleur et objectif du profil connecté (écran Profil). */
export function useIdentity(profileId: string | null) {
  return useQuery({
    queryKey: queryKeys.profile.identity(profileId ?? ""),
    queryFn: () => fetchIdentity(getSupabaseBrowserClient(), profileId!),
    enabled: !!profileId,
  });
}
