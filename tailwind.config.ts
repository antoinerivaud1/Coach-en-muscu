import type { Config } from "tailwindcss";

/**
 * Design system : Refonte UI « Direction Sport » (CM-31).
 * Thème encre + vert acide, un accent par personne.
 * CM-87 : l'accent de membre n'est plus « toi » / « elle » mais la couleur
 * choisie par chacun (`profiles.accent_color`, lib/members.ts). La classe
 * `member` (`bg-member`, `text-member/80`…) lit la variable CSS
 * `--member-rgb`, posée par l'écran sur le conteneur du membre concerné
 * (`memberStyle`, lib/duo.ts) ; cyan par défaut (app/globals.css).
 */
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
        ink: "#0B0B0F",
        surface: "#16161C",
        surface2: "#1F1F27",
        line: "rgba(255,255,255,0.07)",
        // Accent d'énergie (vert acide)
        // `dim` : muscles secondaires sur la carte musculaire (CM-30).
        energy: { DEFAULT: "#CCFF02", fg: "#0B0B0F", dim: "#6F8A0B" },
        // Carte musculaire (CM-30) : muscle non sollicité / zone hors muscle.
        body: { idle: "#3A3A44", base: "#26262E" },
        flame: "#FF8A3D",
        // Texte
        fg: { DEFAULT: "#F2F2F5", muted: "#8C8C97", faint: "#56565E" },
        // Accent du membre affiché (CM-87), opacités comprises.
        member: "rgb(var(--member-rgb) / <alpha-value>)"
      },
      // CM-101 : échelle de texte agrandie pour la lecture à bout de bras, à la
      // salle (design system « Coach en Muscu », 08/10/2026). Rien sous 12px.
      fontSize: {
        xs: ["14px", { lineHeight: "20px" }],
        sm: ["16px", { lineHeight: "22px" }],
        base: ["17px", { lineHeight: "24px" }],
        lg: ["19px", { lineHeight: "26px" }]
      },
      fontFamily: {
        sans: ["var(--font-archivo)", "system-ui", "sans-serif"],
        oswald: ["var(--font-oswald)", "system-ui", "sans-serif"]
      }
    }
  },
  plugins: []
};
export default config;
