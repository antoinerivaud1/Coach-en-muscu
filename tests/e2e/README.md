# Tests e2e (CM-56)

Parcours critiques joués dans un vrai navigateur contre l'app démarrée.

| Fichier | Parcours | Écrit en base |
| --- | --- | --- |
| `smoke.spec.ts` | l'accueil affiche le sélecteur de profil | non |
| `profil.spec.ts` | choisir un profil, changer de profil | oui (purge CM-83 du tableau de bord) |
| `seance.spec.ts` | démarrer, valider une série, abandonner, quitter puis reprendre, supprimer, terminer via la croix (CM-94) | oui |
| `progression.spec.ts` | une séance terminée apparaît dans « Stats » | oui |

Chaque séance créée est supprimée à la fin du test **par l'UI** (feuille de
sortie ou bouton « Supprimer » du récap), même si le test échoue.

## Garde-fous : jamais contre la prod

La prod est le projet Supabase `drmmgwchoowggpsppilo`. Les fichiers qui
écrivent :

- sont **ignorés** tant que `E2E_ALLOW_WRITES` n'est pas à `1` ;
- **échouent net** si `E2E_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL`
  contient la référence du projet de prod.

Ces garde-fous ne voient que l'environnement du runner, pas celui de l'app :
c'est à toi de démarrer l'app sur une base de test. La base de test, c'est la
stack Supabase **locale** (Docker), en CI comme sur ton poste.

## En CI (CM-98)

Le job `e2e` de `.github/workflows/ci.yml` tourne sur chaque PR et chaque push
sur `main`, sans aucun secret :

1. `supabase start` (CLI installée par `supabase/setup-cli`, version figée)
   avec les services inutiles exclus (`realtime`, `storage-api`, `imgproxy`,
   `mailpit`, `postgres-meta`, `studio`, `edge-runtime`, `logflare`, `vector`,
   `supavisor`). `gotrue` reste actif : sans lui `supabase status` ne donne pas
   les clés.
2. `supabase db reset` : base recréée depuis `supabase/migrations/` puis
   `supabase/seed.sql`.
3. `supabase status -o env` fournit `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` (clés de démo
   locales) ; le job refuse toute URL qui n'est pas `http://127.0.0.1:…`.
4. `npm run build` puis `next start` sur le port 3000, attente de la réponse.
5. `npm run test:e2e` avec `E2E_ALLOW_WRITES=1`, `E2E_PROFILE_NAME=Toi`,
   `E2E_SEANCE_NAME=Haut du corps` (données du seed).

En cas d'échec, l'artefact `playwright-report` contient le rapport HTML, les
traces (`test-results/`), `next.log` et les logs PostgREST. Le job e2e tourne
en parallèle du job « Typecheck, lint, unit, build ».

## Reproduire en local (Docker)

```bash
# 1. Stack Supabase locale + base fraîche (migrations + seed)
supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
supabase db reset

# 2. Variables de la stack locale (PAS .env.local, qui vise la prod)
eval "$(supabase status -o env \
  --override-name api.url=NEXT_PUBLIC_SUPABASE_URL \
  --override-name auth.anon_key=NEXT_PUBLIC_SUPABASE_ANON_KEY \
  --override-name auth.service_role_key=SUPABASE_SERVICE_ROLE_KEY \
  | grep -E '^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY)=' \
  | sed 's/^/export /')"

# 3. App sur la base locale
npm run build && npm run start          # laisser tourner

# 4. Dans un autre terminal (mêmes variables exportées)
npx playwright install chromium          # une fois
E2E_ALLOW_WRITES=1 \
E2E_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
E2E_BASE_URL=http://localhost:3000 \
E2E_PROFILE_NAME=Toi E2E_SEANCE_NAME="Haut du corps" \
npm run test:e2e

# 5. Fin
supabase stop --no-backup
```

Attention : `next build` grave `NEXT_PUBLIC_*` dans le bundle. Après un build
local contre la stack Docker, rebuilder avant tout usage avec `.env.local`.

## Données attendues

Celles de `supabase/seed.sql` (fictives) : profils « Toi » et « Elle »,
programme « Nos séances » avec les séances types « Haut du corps » et
« Bas du corps » (4 exercices chacune). Sans `E2E_PROFILE_NAME` /
`E2E_SEANCE_NAME`, les tests prennent le premier profil et la première séance
non vide. Les tests tournent en série (`--workers=1`) : ils partagent un
profil, et chacun supprime ses séances par l'UI.
