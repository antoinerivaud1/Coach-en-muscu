import type { Config } from "tailwindcss";

/**
 * Design system — Refonte UI « Direction Sport » (CM-31).
 * Thème encre + vert acide, un accent par personne.
 * Les rôles couleur en base restent `toi`/`elle` ; seules les valeurs de
 * rendu changent (toi orange -> cyan, elle violet -> rose).
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
        energy: { DEFAULT: "#CCFF02", fg: "#0B0B0F" },
        flame: "#FF8A3D",
        // Texte
        fg: { DEFAULT: "#F2F2F5", muted: "#8C8C97", faint: "#56565E" },
        // Accents par profil (rôles inchangés)
        toi: { DEFAULT: "#2FE6FF", fg: "#0B0B0F" }, // Lui — cyan
        elle: { DEFAULT: "#FF4F7E", fg: "#0B0B0F" } // Elle — rose
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
