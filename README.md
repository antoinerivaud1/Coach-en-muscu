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

## Roadmap
Phase 1 Foundation, Phase 2 Core Tracking, Phase 3 Progression Dashboard,
Phase 4 Polish & PWA. Suivi dans Linear.

Repo configuré sur main, branche par défaut.
