"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSetPersistence } from "@/hooks/useSetPersistence";
import { invalidateSessions } from "@/hooks/data/useSessionScreen";

/**
 * Rattrapage des séries restées en attente sur une séance terminée (CM-78).
 *
 * Cas unique mais réel : l'utilisateur a répondu « Terminer quand même » alors
 * que la file n'était pas vide. La séance passe en récap, `SessionLogger` n'est
 * plus monté, et plus personne ne possède cette file. Ce composant en reprend
 * la propriété (exactement une par séance, jamais deux à la fois puisque le
 * récap et le logger s'excluent) et relit la séance quand elle se vide, pour
 * que le récap affiche les séries qui viennent d'être écrites.
 *
 * CM-88 (PR 6) : relecture par le cache (accueil, Carnet et Stats compris),
 * au lieu de `router.refresh()`.
 *
 * N'affiche rien : la pastille et le bandeau appartiennent à l'écran de saisie.
 */
export default function PendingSetsSync({
  profileId,
  sessionId,
}: {
  profileId: string;
  sessionId: string;
}) {
  const queryClient = useQueryClient();
  const { hasPending } = useSetPersistence(sessionId);
  const hadPending = useRef(false);

  useEffect(() => {
    if (hasPending) {
      hadPending.current = true;
      return;
    }
    if (!hadPending.current) return;
    hadPending.current = false;
    void invalidateSessions(queryClient, profileId);
  }, [hasPending, queryClient, profileId]);

  return null;
}
