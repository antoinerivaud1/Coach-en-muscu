/**
 * CM-86 / CM-87 : couleur de membre (maquettes validées le 07/10/2026).
 *
 * Contrat commun à l'onboarding solo (CM-86) et au duo (CM-87) : chaque
 * profil choisit une couleur parmi 6, stockée dans `profiles.accent_color`
 * (contrainte `profiles_accent_color_palette`, mêmes valeurs qu'ici). Elle
 * remplace `color_role` ('toi' / 'elle'), conservée en base le temps que
 * l'ancien code cesse de la lire : le nouveau code passe par `memberAccent`.
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

/** Couleur par défaut (défaut de la colonne en base). */
export const DEFAULT_MEMBER_COLOR: MemberColor = "#2FE6FF";

const MEMBER_COLOR_VALUES: readonly string[] = MEMBER_COLORS.map((c) => c.value);

/** Vrai si `value` est exactement l'une des 6 couleurs (casse comprise). */
export function isMemberColor(value: unknown): value is MemberColor {
  return typeof value === "string" && MEMBER_COLOR_VALUES.includes(value);
}

/**
 * Couleur d'un membre : `accent_color` si elle est valide, sinon repli sur
 * l'ancien `color_role` ('elle' -> rose, sinon cyan).
 */
export function memberAccent(profile: {
  accent_color?: string | null;
  color_role?: "toi" | "elle" | null;
}): MemberColor {
  if (isMemberColor(profile.accent_color)) return profile.accent_color;
  return profile.color_role === "elle" ? "#FF4F7E" : DEFAULT_MEMBER_COLOR;
}
