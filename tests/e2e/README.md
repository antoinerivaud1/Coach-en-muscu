# Tests e2e (CM-56)

Parcours critiques joués dans un vrai navigateur contre l'app démarrée.

| Fichier | Parcours | Écrit en base |
| --- | --- | --- |
| `smoke.spec.ts` | l'accueil affiche le sélecteur de profil ; `/login` renvoie au sélecteur en mode cookie (CM-58) | non |
| `profil.spec.ts` | choisir un profil, changer de profil | oui (purge CM-83 du tableau de bord) |
| `seance.spec.ts` | démarrer, valider une série, abandonner, quitter puis reprendre, supprimer, terminer via la croix (CM-94) | oui |
| `progression.spec.ts` | une séance terminée apparaît dans « Stats » | oui |

Tous les parcours supposent l'app en `AUTH_MODE=cookie` (variable absente,
défaut). Les modes `hybrid` et `required` (CM-58) se testent à la main : voir
`supabase/ops/2026-10-cm58-bascule.md`.

Chaque séance créée est supprimée à la fin du test **par l'UI** (feuille de
sortie ou bouton « Supprimer » du récap), même si le test échoue.

## Garde-fous : jamais contre la prod

La seule base Supabase existante est la prod (`drmmgwchoowggpsppilo`). Les
fichiers qui écrivent :

- sont **ignorés** tant que `E2E_ALLOW_WRITES` n'est pas à `1` ;
- **échouent net** si `E2E_SUPABASE_URL` ou `NEXT_PUBLIC_SUPABASE_URL`
  contient la référence du projet de prod.

Ces garde-fous ne voient que l'environnement du runner, pas celui de l'app :
c'est à toi de démarrer l'app sur la base de test.

## Lancer en local contre une base de test

```bash
# 1. App branchée sur la base de TEST (pas .env.local, qui vise la prod)
NEXT_PUBLIC_SUPABASE_URL=<url de test> \
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon de test> \
SUPABASE_SERVICE_ROLE_KEY=<service_role de test> \
npm run build && npm run start

# 2. Dans un autre terminal
npx playwright install chromium          # une fois
E2E_ALLOW_WRITES=1 \
E2E_SUPABASE_URL=<url de test> \
E2E_BASE_URL=http://localhost:3000 \
npm run test:e2e
```

Données attendues : au moins un profil, et pour ce profil une séance type
contenant au moins un exercice. Pour cibler des données précises :
`E2E_PROFILE_NAME` (nom affiché du profil) et `E2E_SEANCE_NAME` (nom de la
séance type). Les tests tournent en série (`--workers=1`) : ils partagent un
profil.

## En CI

Le job `e2e` de `.github/workflows/ci.yml` ne tourne que si le secret
`E2E_SUPABASE_URL` est défini (sinon il est « skipped »). Secrets à créer,
**tous pointant vers la base de test** : `E2E_SUPABASE_URL`,
`E2E_SUPABASE_ANON_KEY`, `E2E_SUPABASE_SERVICE_ROLE_KEY`. Variables
facultatives : `E2E_PROFILE_NAME`, `E2E_SEANCE_NAME`.

## Avoir une base de test : 2 options

1. **Supabase CLI local (Docker), dans la CI et en local.** Gratuit, base
   jetable à chaque run (`supabase start`, puis seed). Prérequis : une
   migration « baseline » qui recrée tout le schéma de prod
   (`supabase db dump` du schéma, sans données), car `supabase/migrations/`
   ne contient aujourd'hui que des deltas. Il faut aussi un `seed.sql`
   (2 profils, un couple, une séance type avec exercices) et adapter le job
   `e2e` pour démarrer la stack locale au lieu de lire des secrets.
2. **Deuxième projet Supabase payant, ou branche Supabase.** Le plan gratuit
   est plein (2 projets) : il faut passer en Pro pour un 3e projet ou pour les
   branches. Base persistante : il faut la tenir à jour à chaque migration et
   la remettre en état si un test laisse des données.
