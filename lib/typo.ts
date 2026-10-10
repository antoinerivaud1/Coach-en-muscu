// CM-93 : typographie française appliquée aux textes des pages légales.
// Logique pure, testée dans tests/unit/legal.spec.ts.

const NBSP = "\u00a0";
// Espace fine insécable : avant ; ! ? (usage typographique français).
const NNBSP = "\u202f";

/**
 * - apostrophe typographique (l'app devient l’app) ;
 * - espace insécable avant « : » et dans les guillemets « » ;
 * - espace fine insécable avant « ; ! ? » ;
 * - espace insécable entre un nombre et son unité (3,99 €, 24 h, 7 jours…).
 * Les URL ne sont pas touchées (pas d'espace avant leurs « : »).
 */
export function frenchTypo(text: string): string {
  return text
    .replace(/(\p{L})'(?=\p{L})/gu, "$1\u2019")
    .replace(/ +:/g, `${NBSP}:`)
    .replace(/ +([;!?])/g, `${NNBSP}$1`)
    .replace(/« +/g, `«${NBSP}`)
    .replace(/ +»/g, `${NBSP}»`)
    .replace(/(\d) +(?=(€|%|h\b|ans?\b|jours?\b|mois\b|heures?\b))/g, `$1${NBSP}`);
}
