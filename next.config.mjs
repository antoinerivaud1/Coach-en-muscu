import { withSentryConfig } from "@sentry/nextjs/config";

/** @type {import('next').NextConfig} */
const nextConfig = { reactStrictMode: true };

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
