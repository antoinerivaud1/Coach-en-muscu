import { withSentryConfig } from "@sentry/nextjs/config";

// CM-89 (PR 2) : les anciennes adresses à segment dynamique (liens en favori,
// notification de repos déjà planifiée, onglet resté ouvert) mènent aux
// nouvelles, l'id passé en query. Seulement des uuid : `/sessions/view` et
// `/seances/new` ne sont jamais capturés. Temporaires (permanent: false) : un
// navigateur ne garde pas la redirection en cache.
// `redirects` n'existe pas avec `output: 'export'` : la PR 3 (cible native)
// devra NE PAS les déclarer pour le build Capacitor, et les garder sur le web.
const UUID_SEGMENT = "[0-9a-fA-F-]{36}";

function legacyIdRedirects() {
  return [
    {
      source: `/sessions/:id(${UUID_SEGMENT})`,
      destination: "/sessions/view?id=:id",
      permanent: false,
    },
    {
      source: `/seances/:id(${UUID_SEGMENT})/edit`,
      destination: "/seances/edit?id=:id",
      permanent: false,
    },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return legacyIdRedirects();
  },
};

// CM-95 : upload des source maps vers Sentry au build Vercel, seulement si
// SENTRY_AUTH_TOKEN est présent (sinon le build passe sans rien envoyer : dev, CI).
// Les source maps sont supprimées du déploiement après upload (pas de code source public).
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? "antoine-7m",
  project: process.env.SENTRY_PROJECT ?? "javascript-nextjs",
  sentryUrl: process.env.SENTRY_URL ?? "https://de.sentry.io",
  authToken: sentryAuthToken,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { disable: !sentryAuthToken },
  // Passe les envois du navigateur par /monitoring sur notre domaine : les bloqueurs
  // de contenu (Safari iOS) ne coupent pas les rapports d'erreur.
  tunnelRoute: "/monitoring",
});
