import { createAuthClient } from "@/lib/supabase/server";

/**
 * CM-87 : client des RPC du duo côté SERVEUR.
 *
 * Les RPC du duo (security definer) lisent l'appelant dans `auth.uid()` : elles
 * passent TOUJOURS par le client utilisateur (`createAuthClient`), même avec le
 * filet `DATA_CLIENT=service`, dont la clé service-role n'a pas d'utilisateur.
 * Elles font elles-mêmes leurs contrôles d'appartenance.
 *
 * CM-88 (PR 7) : l'état du duo, l'aperçu d'une invitation et les actions du
 * duo passent par le navigateur (lib/data/duo.ts, lib/data/profile.ts). Reste
 * ici le client serveur des écrans de séances types pas encore convertis
 * (app/seances/actions.ts).
 */
export async function duoRpcClient() {
  return createAuthClient();
}
