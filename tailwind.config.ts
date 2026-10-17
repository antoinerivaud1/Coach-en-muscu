import type { Config } from "tailwindcss";

/**
 * Design system « A2 » (CM-116, canevas Tour 2 validé le 17/10/2026), clair et
 * sombre. Les couleurs lisent les variables CSS de app/globals.css, en canaux
 * RGB : mêmes classes dans les deux thèmes, opacités comprises (`bg-fg/10`).
 *
 * - `energy` : l'orange PLEIN des boutons d'action (texte dessus : `energy-fg`).
 * - `accent` : l'orange en TEXTE, icône ou bordure, assez foncé pour être
 *   lisible sur le fond du thème (plus foncé en clair).
 * - `member` : la couleur du membre affiché (CM-87), posée par `memberStyle`
 *   (lib/duo.ts) sur le conteneur, variante claire comprise.
 * - `danger`, `success`, `warning` : états, lisibles dans les deux thèmes.
 *
 * `font-oswald` garde son nom (des dizaines d'usages) mais désigne désormais
 * SF Pro Rounded, la police des chiffres.
 */
const rgb = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        // Surfaces
        ink: rgb("ink"),
        surface: rgb("surface"),
        surface2: rgb("surface-2"),
        line: "var(--line)",
        edge: rgb("edge"),
        // Action
        energy: { DEFAULT: rgb("energy"), fg: rgb("energy-fg"), dim: rgb("energy-dim") },
        accent: rgb("accent"),
        flame: rgb("flame"),
        // Carte musculaire (CM-30)
        body: { idle: rgb("body-idle"), base: rgb("body-base") },
        // Texte
        fg: { DEFAULT: rgb("fg"), soft: rgb("fg-soft"), muted: rgb("fg-muted"), faint: rgb("fg-faint") },
        // États
        danger: { DEFAULT: rgb("danger"), soft: rgb("danger-soft"), ground: rgb("danger-ground") },
        success: rgb("success"),
        warning: rgb("warning"),
        // Accent du membre affiché (CM-87)
        member: rgb("member-rgb")
      },
      // CM-101 : échelle de texte agrandie pour la lecture à bout de bras, à la
      // salle. Rien sous 12px.
      fontSize: {
        xs: ["14px", { lineHeight: "20px" }],
        sm: ["16px", { lineHeight: "22px" }],
        base: ["17px", { lineHeight: "24px" }],
        lg: ["19px", { lineHeight: "26px" }]
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "system-ui", '"Segoe UI"', "Roboto", "sans-serif"],
        oswald: ["ui-rounded", '"SF Pro Rounded"', "-apple-system", "BlinkMacSystemFont", "system-ui", "sans-serif"]
      },
      borderRadius: {
        card: "28px"
      }
    }
  },
  plugins: []
};
export default config;
