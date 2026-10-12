"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ScreenError, ScreenSkeleton } from "@/components/ScreenState";
import { useProfileId } from "@/hooks/useProfileId";

/**
 * CM-59 B : `/` n'est qu'une redirection, `/dashboard` avec une session,
 * `/login` sinon. CM-89 (PR 1) : faite dans le navigateur (l'ancienne route
 * serveur, app/route.ts, est interdite dans un export statique). Le cookie
 * `cm_profile` qu'elle effaçait l'est désormais par le middleware (web).
 *
 * « Personne » en cache n'est suivi qu'une fois relu (même règle que
 * `useRequireProfileId`) ; une erreur réseau n'est pas une déconnexion :
 * « Réessayer », sans redirection.
 */
export default function RootRedirect() {
  const router = useRouter();
  const auth = useProfileId();
  const target = auth.data
    ? "/dashboard"
    : auth.isSuccess && !auth.isFetching && auth.data === null
      ? "/login"
      : null;

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  return (
    <main className="min-h-[100dvh] p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mx-auto max-w-lg pt-10">
        {auth.error && auth.data === undefined ? (
          <ScreenError onRetry={() => void auth.refetch()} />
        ) : (
          <ScreenSkeleton label="Chargement" />
        )}
      </div>
    </main>
  );
}
