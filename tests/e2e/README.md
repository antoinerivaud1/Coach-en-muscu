# Tests e2e (CM-56)

Parcours critiques joués dans un vrai navigateur contre l'app démarrée.

| Fichier | Parcours | Écrit en base |
| --- | --- | --- |
| `smoke.spec.ts` | sans session, l'accueil et le tableau de bord renvoient à `/login` (CM-59 B) | non |
| `isolation.spec.ts` | RLS (CM-59 B) : Solo n'ouvre pas une séance du duo et ne voit ni son programme ni son historique ; le duo n'ouvre pas une séance de Solo ; Elle voit l'historique de Toi | non (purge CM-83 du tableau de bord) |
| `profil.spec.ts` | se connecter, se déconnecter | oui (purge CM-83 du tableau de bord) |
| `seance.spec.ts` | démarrer, valider une série, abandonner, quitter puis reprendre, supprimer, terminer via la croix (CM-94) | oui |
| `progression.spec.ts` | une séance terminée apparaît dans « Stats » | oui |
| `onboarding.spec.ts` | CM-86 : inscription d'un nouveau compte, onboarding complet (prénom, couleur, objectif), modèle de séances ajouté, accueil du premier jour ; un solo crée un exercice perso et le retrouve dans le catalogue ; un compte déjà onboardé n'est jamais redirigé vers `/onboarding` | oui (crée des comptes `cm86-…@coach-en-muscu.test`) |

Depuis CM-59 B, l'app n'a plus de sélecteur de profil ni de mode d'auth : les
parcours se connectent par `/login` avec les comptes du seed (helper `login`),
et toutes les requêtes passent par le client utilisateur, sous RLS.

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
5. `npm run test:e2e` avec `E2E_ALLOW_WRITES=1`, `SIGNUP_ENABLED=1` (CM-86 :
   inscription ouverte côté app, lue par `next start`) et
   `E2E_SEANCE_NAME=Haut du corps` (données du seed) ; les parcours se
   connectent avec le compte « Toi » du seed.

6. CM-59 B : l'app redémarre avec `DATA_CLIENT=service` (filet de
   déploiement : client service-role, RLS contournée) et **toute la suite e2e
   est rejouée**, isolation comprise ; la CI vérifie dans `next-service.log`
   que le client service-role a bien servi.

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
E2E_SEANCE_NAME="Haut du corps" \
npm run test:e2e
# (l'app doit avoir été démarrée avec SIGNUP_ENABLED=1 pour onboarding.spec.ts)

# 5. Fin
supabase stop --no-backup
```

Attention : `next build` grave `NEXT_PUBLIC_*` dans le bundle. Après un build
local contre la stack Docker, rebuilder avant tout usage avec `.env.local`.

## Données attendues

Celles de `supabase/seed.sql` (fictives) : comptes Auth
`toi@coach-en-muscu.test` et `elle@coach-en-muscu.test` (duo « Nous ») et
`solo@coach-en-muscu.test` (hors duo, pour les tests RLS de CM-59), mot de
passe `motdepasse-de-test` ; programme « Nos séances » avec les séances types
« Haut du corps » et « Bas du corps » (4 exercices chacune). Les parcours qui
écrivent utilisent « Toi » (ou `E2E_EMAIL` / `E2E_PASSWORD`). Sans
`E2E_SEANCE_NAME`, ils prennent la première séance non vide. Les tests tournent
en série (`--workers=1`) : ils partagent un compte, et chacun supprime ses
séances par l'UI.
