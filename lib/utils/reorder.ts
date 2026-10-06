// Réordonnancement d'une liste par flèches monter / descendre (CM-71).
//
// Fonctions pures, sans I/O ni React : l'éditeur de séance type s'en sert sur
// son état local, et `saveSeance` renumérote les `order_index` au moment
// d'écrire. Pas de drag and drop : peu fiable au doigt en PWA iOS.

export type MoveDirection = "up" | "down";

/**
 * Déplace d'un cran l'élément d'index `from`.
 *
 * Renvoie la MÊME référence quand il n'y a rien à faire (index invalide ou
 * élément déjà en butée) : un `setState` avec cette valeur ne déclenche pas de
 * rendu inutile. Sinon, un nouveau tableau ; l'original n'est jamais muté.
 */
export function moveItem<T>(
  items: T[],
  from: number,
  direction: MoveDirection,
): T[] {
  const to = direction === "up" ? from - 1 : from + 1;
  if (
    !Number.isInteger(from) ||
    from < 0 ||
    from >= items.length ||
    to < 0 ||
    to >= items.length
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved as T);
  return next;
}

/**
 * Déplace d'un cran l'élément identifié par `key`.
 *
 * Chercher l'index au moment du déplacement (et non le figer au rendu) évite
 * de déplacer le mauvais élément sur deux taps rapides : le second tap
 * s'applique à la liste déjà réordonnée par le premier (CM-71).
 */
export function moveItemByKey<T, K>(
  items: T[],
  getKey: (item: T) => K,
  key: K,
  direction: MoveDirection,
): T[] {
  return moveItem(
    items,
    items.findIndex((item) => getKey(item) === key),
    direction,
  );
}

/**
 * Associe à chaque élément son `order_index` : sa position, renumérotée de
 * 0 à n-1. C'est l'ordre affiché dans l'éditeur qui fait foi à l'écriture,
 * ce qui rattrape au passage d'éventuels trous ou doublons hérités.
 */
export function withOrderIndex<T>(
  items: T[],
): (T & { order_index: number })[] {
  return items.map((item, i) => ({ ...item, order_index: i }));
}
