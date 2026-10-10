/**
 * Clé stable d'un exercice du catalogue système, dérivée de son nom :
 * minuscules, sans accents, espaces normalisés. Sert d'index au contenu
 * statique (fiches, muscles) pour qu'une variation d'accent ou de casse en
 * base ne fasse pas perdre la fiche.
 */
export function exerciseKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
