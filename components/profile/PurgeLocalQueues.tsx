"use client";

import { useEffect } from "react";
import { purgeLocalQueues } from "@/lib/localQueues";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * CM-60 : vide les files locales du téléphone (séries et fins de séance en
 * attente, et leurs refus) une fois le compte supprimé : elles n'appartiennent
 * plus à personne et ne doivent pas être rejouées par un autre compte.
 *
 * Seulement s'il n'y a plus de session sur cet appareil (la suppression l'a
 * fermée) : un compte connecté qui ouvrirait cette adresse à la main garde
 * les siennes.
 *
 * CM-89 (PR 3) : décidé dans le navigateur (la page est statique, plus de
 * lecture des cookies côté serveur). `getSession()` lit la session stockée
 * (cookies sur le web, stockage natif après la PR 4) sans la valider : même
 * critère qu'avant (« un cookie de session est présent »), et ce n'est pas
 * une décision d'accès. Erreur (réseau pendant un rafraîchissement du
 * jeton) : on ne purge pas, dans le doute. Pas d'annulation au démontage :
 * la purge reste due même si l'écran est quitté avant la réponse.
 */
export default function PurgeLocalQueues() {
  useEffect(() => {
    getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data, error }) => {
        if (!error && !data.session) purgeLocalQueues();
      })
      .catch(() => {});
  }, []);
  return null;
}
