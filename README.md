# Coach en Muscu

Tracker de séances pour Toi et Elle. Stack: Next.js 15, TypeScript strict,
Tailwind, Supabase, Vercel.

## Dev
npm install && npm run dev

## Tests et CI
- `npm run typecheck`, `npm run lint`, `npm run test:unit` : lancés par la CI
  (`.github/workflows/ci.yml`) à chaque PR, avec un `next build` sur env
  factices.
- `npm run test:e2e` : parcours réels qui écrivent en base. Jamais contre la
  prod ; base de test requise. Voir `tests/e2e/README.md`.

## Monitoring des erreurs (Sentry, CM-95)
Org `antoine-7m`, projet `javascript-nextjs`, région UE (`de.sentry.io`).
Erreurs uniquement : pas de tracing, pas de Session Replay, `sendDefaultPii: false`,
utilisateur, cookies, en-têtes et query string retirés avant envoi (`lib/sentry/options.ts`).

Variables Vercel :
- `NEXT_PUBLIC_SENTRY_DSN` (Production, Preview) : sans elle, Sentry est désactivé.
- `SENTRY_AUTH_TOKEN` (Production, Preview) : upload des source maps au build ;
  sans lui le build passe, mais les piles client restent minifiées.
- `SENTRY_TEST_PAGE=1` : active `/sentry-test` (deux boutons qui plantent exprès).
  À ne poser que le temps d'un test, puis à retirer.

Côté Sentry : « Prevent Storing of IP Addresses » doit être coché (Settings >
Security & Privacy), sinon Sentry déduit l'IP et la ville à la réception.

Les envois du navigateur passent par `/monitoring` sur notre domaine (tunnel),
pour ne pas être coupés par les bloqueurs de contenu.

## Roadmap
Phase 1 Foundation, Phase 2 Core Tracking, Phase 3 Progression Dashboard,
Phase 4 Polish & PWA. Suivi dans Linear.

Repo configuré sur main, branche par défaut.
