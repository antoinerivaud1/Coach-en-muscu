"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/data/queryKeys";
import { isUuid, loginPath, resolveProfileId } from "@/lib/auth/core";

/**
 * CM-88 : id du profil connecté, côté navigateur. Même règle que le serveur
 * (`lib/profile.ts`) : `getClaims()` valide le JWT, `claims.sub` est l'id du
 * profil, sinon personne. Jamais `getSession()` seul pour décider d'un accès.
 *
 * La sécurité reste en base (RLS) : ce hook ne sert qu'à savoir quoi afficher
 * et quand renvoyer vers `/login`.
 */
export async function readBrowserProfileId(): Promise<string | null> {
  const { data, error } = await getSupabaseBrowserClient().auth.getClaims();
  if (error) throw error;
  const sub = data?.claims?.sub;
  return resolveProfileId(isUuid(sub) ? sub : null);
}

export function useProfileId() {
  return useQuery({
    queryKey: queryKeys.auth(),
    queryFn: readBrowserProfileId,
    staleTime: 5 * 60_000,
  });
}

/**
 * Pour les écrans privés : renvoie l'id du profil une fois connu, et redirige
 * vers `/login?next=<chemin>` si personne n'est connecté (équivalent client de
 * `requireProfileId(next)`). Une erreur réseau n'est PAS une déconnexion :
 * l'écran affiche son état d'erreur, sans redirection.
 */
export function useRequireProfileId(next: string) {
  const router = useRouter();
  const query = useProfileId();
  const signedOut = query.isSuccess && query.data === null;

  useEffect(() => {
    if (signedOut) router.replace(loginPath(next));
  }, [signedOut, router, next]);

  return {
    profileId: query.data ?? null,
    isPending: query.isPending || signedOut,
    error: query.error,
    refetch: query.refetch,
  };
}
