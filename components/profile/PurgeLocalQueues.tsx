"use client";

import { useEffect } from "react";
import { purgeLocalQueues } from "@/lib/localQueues";

/**
 * CM-60 : vide les files locales du téléphone (séries et fins de séance en
 * attente, et leurs refus) une fois le compte supprimé : elles n'appartiennent
 * plus à personne et ne doivent pas être rejouées par un autre compte.
 */
export default function PurgeLocalQueues({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) purgeLocalQueues();
  }, [enabled]);
  return null;
}
