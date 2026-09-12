"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSetPersistence } from "@/hooks/useSetPersistence";

/**
 * Rattrapage des séries restées en attente sur une séance terminée (CM-78).
 *
 * Cas unique mais réel : l'utilisateur a répondu « Terminer quand même » alors
 * que la file n'était pas vide. La séance passe en récap, `SessionLogger` n'est
 * plus monté, et plus personne ne possède cette file. Ce composant en reprend
 * la propriété — exactement une par séance, jamais deux à la fois puisque le
 * récap et le logger s'excluent — et rafraîchit la page quand elle se vide,
 * pour que le récap affiche les séries qui viennent d'être écrites.
 *
 * N'affiche rien : la pastille et le bandeau appartiennent à l'écran de saisie.
 */
export default function PendingSetsSync({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const { hasPending } = useSetPersistence(sessionId);
  const hadPending = useRef(false);

  useEffect(() => {
    if (hasPending) {
      hadPending.current = true;
      return;
    }
    if (!hadPending.current) return;
    hadPending.current = false;
    router.refresh();
  }, [hasPending, router]);

  return null;
}
