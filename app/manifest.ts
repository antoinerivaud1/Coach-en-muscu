import type { MetadataRoute } from "next";

// CM-89 (PR 3) : exigé par l'export statique natif (`output: "export"`) pour
// une route de métadonnées. Sans effet sur le web : le manifeste y était
// déjà généré au build (aucune donnée de requête).
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Coach en Muscu",
    short_name: "Muscu",
    description: "Suivi de séances de musculation, seul ou à deux",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#F97316",
    lang: "fr",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
