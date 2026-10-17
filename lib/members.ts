/**
 * CM-86 / CM-87 : couleur de membre (maquettes validées le 07/10/2026).
 *
 * Contrat commun à l'onboarding solo (CM-86) et au duo (CM-87) : chaque
 * profil choisit une couleur parmi 6, stockée dans `profiles.accent_color`
 * (NOT NULL, contrainte `profiles_accent_color_palette`, mêmes valeurs
 * qu'ici). CM-103 : l'ancien `color_role` ('toi' / 'elle') n'est plus lu nulle
 * part (colonne supprimée par la migration 20261011120000, après déploiement).
 *
 * Module pur : aucun import serveur ni Supabase (testé dans
 * tests/unit/members.spec.ts).
 */

export const MEMBER_COLORS = [
  { value: "#2FE6FF", label: "Cyan" },
  { value: "#FF4F7E", label: "Rose" },
  { value: "#FF8A3D", label: "Orange" },
  { value: "#A78BFA", label: "Violet" },
  { value: "#5B8CFF", label: "Bleu" },
  { value: "#FFD23F", label: "Jaune" },
] as const;

export type MemberColor = (typeof MEMBER_COLORS)[number]["value"];

/**
 * CM-116 : variante de chaque couleur pour le thème clair, plus foncée pour
 * rester lisible sur fond blanc (texte, pastilles, courbes). Le thème sombre
 * garde la couleur choisie telle quelle.
 */
export const MEMBER_COLORS_LIGHT: Record<string, string> = {
  "#2FE6FF": "#0A84B8",
  "#FF4F7E": "#D6336C",
  "#FF8A3D": "#C2410C",
  "#A78BFA": "#7C3AED",
  "#5B8CFF": "#2563EB",
  "#FFD23F": "#A16207",
};

/** Couleur d'un membre pour le thème clair (la couleur telle quelle si inconnue). */
export function memberColorLight(value: string): string {
  return MEMBER_COLORS_LIGHT[value] ?? value;
}

/**
 * CM-116 : valeur CSS d'une couleur de membre qui suit le thème, pour un style
 * en ligne (`style={{ color: memberCss(c) }}`) ou un attribut SVG. Les 6
 * couleurs de la palette lisent `--mc-<HEX>` (app/globals.css), qui vaut la
 * couleur choisie en sombre et sa variante foncée en clair. `alpha` (0 à 1)
 * remplace les suffixes hexadécimaux (`${c}1A`). Hors palette : la couleur
 * telle quelle.
 */
export function memberCss(value: string, alpha?: number): string {
  if (isMemberColor(value)) {
    const v = `--mc-${value.slice(1).toUpperCase()}`;
    return alpha === undefined ? `rgb(var(${v}))` : `rgb(var(${v}) / ${alpha})`;
  }
  if (alpha === undefined || !/^#[0-9a-f]{6}$/i.test(value)) return value;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${value}${a}`;
}

/** Couleur par défaut (défaut de la colonne en base). */
export const DEFAULT_MEMBER_COLOR: MemberColor = "#2FE6FF";

const MEMBER_COLOR_VALUES: readonly string[] = MEMBER_COLORS.map((c) => c.value);

/** Vrai si `value` est exactement l'une des 6 couleurs (casse comprise). */
export function isMemberColor(value: unknown): value is MemberColor {
  return typeof value === "string" && MEMBER_COLOR_VALUES.includes(value);
}

/**
 * Couleur d'un membre : `accent_color` si elle est valide, sinon cyan
 * (`DEFAULT_MEMBER_COLOR`). La colonne est NOT NULL en base : le repli ne
 * sert qu'à une ligne illisible (partenaire non lu, profil absent).
 */
export function memberAccent(profile: { accent_color?: string | null }): MemberColor {
  return isMemberColor(profile.accent_color) ? profile.accent_color : DEFAULT_MEMBER_COLOR;
}

/** Libellé d'une couleur (« Rose »), vide si hors palette. */
export function memberColorLabel(value: string | null | undefined): string {
  return MEMBER_COLORS.find((c) => c.value === value)?.label ?? "";
}

// ---- CM-103 : une couleur par membre dans le duo -------------------------------

/**
 * « de Lina », « d’Antoine », « d’Hugo » : élision devant une voyelle ou un h.
 * Un prénom vide donne « de ton partenaire ».
 */
export function deName(name: string | null | undefined): string {
  const n = (name ?? "").trim();
  if (!n) return "de ton partenaire";
  return /^[aeiouyhàâäéèêëîïôöùûüœæ]/i.test(n) ? `d\u2019${n}` : `de ${n}`;
}

/** Partenaire de duo tel que l'écran ou l'action le lit (prénom, couleur). */
export type PartnerColor = { name: string; color: string };

/**
 * Couleur prise par le partenaire, ou null : solo, partenaire illisible ou
 * couleur hors palette (rien à griser).
 */
export function takenPartnerColor(partner: PartnerColor | null | undefined): MemberColor | null {
  return partner && isMemberColor(partner.color) ? partner.color : null;
}

/**
 * Refus d'une couleur déjà portée par le partenaire (message affiché sous le
 * sélecteur), null si elle est libre. Un solo n'a aucune restriction.
 */
export function partnerColorConflict(
  requested: string,
  partner: PartnerColor | null | undefined,
): string | null {
  const taken = takenPartnerColor(partner);
  if (!taken || requested !== taken) return null;
  return `C\u2019est la couleur ${deName(partner!.name)}\u00a0: choisis-en une autre.`;
}

/** Couleur de départ du sélecteur : la mienne, sauf si le partenaire l'a déjà. */
export function initialPickerColor(
  mine: string | null | undefined,
  partner: PartnerColor | null | undefined,
): MemberColor {
  const taken = takenPartnerColor(partner);
  const current = memberAccent({ accent_color: mine });
  if (current !== taken) return current;
  return MEMBER_COLORS.find((c) => c.value !== taken)!.value;
}

/**
 * Nom affiché d'un exercice dans une séance : le nom lu, sinon (exercice
 * personnel du partenaire, illisible sous RLS) « Exercice personnel de
 * <prénom> » sur la séance du partenaire, « Exercice » sur la mienne.
 */
export function sessionExerciseLabel(
  name: string | null | undefined,
  owner: { isMine: boolean; name: string | null | undefined },
): string {
  const n = (name ?? "").trim();
  if (n) return n;
  return owner.isMine ? "Exercice" : `Exercice personnel ${deName(owner.name)}`;
}
