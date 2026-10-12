import { withSentryConfig } from "@sentry/nextjs/config";

// CM-89 (PR 3) : deux cibles de build, un seul code.
// - web (défaut, Vercel) : build Next normal, inchangé ;
// - native (`BUILD_TARGET=native`, via `npm run build:native`) : export
//   statique embarqué dans la coque Capacitor iOS (`capacitor/www`). Aucun
//   serveur : ni middleware, ni redirections, ni tunnel Sentry.
const isNative = process.env.BUILD_TARGET === "native";

// CM-89 (PR 3) : les fichiers propres au serveur web sont suffixés `.web`
// (`middleware.web.ts`, `app/sentry-test/page.web.tsx`). Next (et Sentry)
// ne les voient que si l'extension est déclarée : la cible native les ignore
// sans rien déplacer sur le disque, donc rien à restaurer si le build échoue.
const DEFAULT_PAGE_EXTENSIONS = ["tsx", "ts", "jsx", "js"];
const WEB_ONLY_PAGE_EXTENSIONS = ["web.tsx", "web.ts"];

// CM-89 (PR 2) : les anciennes adresses à segment dynamique (liens en favori,
// notification de repos déjà planifiée, onglet resté ouvert) mènent aux
// nouvelles, l'id passé en query. Seulement des uuid : `/sessions/view` et
// `/seances/new` ne sont jamais capturés. Temporaires (permanent: false) : un
// navigateur ne garde pas la redirection en cache.
// CM-89 (PR 3) : web seulement, `redirects` n'existe pas avec `output: 'export'`.
const UUID_SEGMENT = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

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
const webConfig = {
  reactStrictMode: true,
  pageExtensions: [...DEFAULT_PAGE_EXTENSIONS, ...WEB_ONLY_PAGE_EXTENSIONS],
  async redirects() {
    return legacyIdRedirects();
  },
};

// CM-89 (PR 3) : `trailingSlash: false` produit `dashboard.html` (et non
// `dashboard/index.html`) ; le routeur iOS de la PR 4 sert `/dashboard`
// depuis ce fichier. Pas de `images.unoptimized` : l'app n'utilise pas
// `next/image`. Sortie dans `out/`, copiée dans `capacitor/www` par
// scripts/build-native.mjs. Pas de `distDir` dédié : avec un export, Next
// garde `.next` pour le build et utilise `distDir` comme dossier d'export.
// `NEXT_PUBLIC_BUILD_TARGET` : environnement Sentry « native »
// (lib/sentry/options.ts).
/** @type {import('next').NextConfig} */
const nativeConfig = {
  reactStrictMode: true,
  pageExtensions: DEFAULT_PAGE_EXTENSIONS,
  output: "export",
  trailingSlash: false,
  env: { NEXT_PUBLIC_BUILD_TARGET: "native" },
};

// CM-95 : upload des source maps vers Sentry au build Vercel, seulement si
// SENTRY_AUTH_TOKEN est présent (sinon le build passe sans rien envoyer : dev, CI).
// Les source maps sont supprimées du déploiement après upload (pas de code source public).
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;

export default withSentryConfig(isNative ? nativeConfig : webConfig, {
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
  // CM-89 (PR 3) : web seulement. L'app native n'a pas de serveur : envoi
  // direct à Sentry.
  ...(isNative ? {} : { tunnelRoute: "/monitoring" }),
});
