"use client";

// CM-95 : dernier filet quand le layout racine lui-même plante. Remonte l'erreur
// à Sentry et propose de recharger. Ce composant remplace <html>, d'où les styles inline.
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="fr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          background: "#0B0B0F",
          color: "#F2F2F5",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: 24, margin: 0 }}>Oups, l&apos;app a planté</h1>
        <p style={{ fontSize: 17, margin: 0, color: "#9A9AA8", maxWidth: 360 }}>
          L&apos;erreur nous a été signalée. Tes séries déjà validées sont enregistrées.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            fontSize: 17,
            fontWeight: 700,
            padding: "14px 24px",
            borderRadius: 999,
            border: "none",
            background: "#CCFF02",
            color: "#0B0B0F",
          }}
        >
          Recharger
        </button>
      </body>
    </html>
  );
}
