// CM-90 (PR 1) : qui envoie la file de séries d'une séance ?
//
// Pendant la saisie (logger) ou sur le récap, `useSetPersistence` possède la
// file de SA séance : elle l'envoie elle-même, avec pastilles et backoff.
// Toutes les autres files (séance quittée, app relancée ailleurs que sur la
// séance) sont rejouées par `PendingSync`, qui saute celles possédées ici.
// Un doublon reste sans danger (écritures idempotentes) ; ce registre évite
// seulement les envois en double inutiles.

const owners = new Map<string, number>();

/** Marque la file de `sessionId` comme possédée ; rend la fonction de libération. */
export function claimSessionQueue(sessionId: string): () => void {
  owners.set(sessionId, (owners.get(sessionId) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    const n = (owners.get(sessionId) ?? 1) - 1;
    if (n <= 0) owners.delete(sessionId);
    else owners.set(sessionId, n);
  };
}

export function isSessionQueueOwned(sessionId: string): boolean {
  return owners.has(sessionId);
}
