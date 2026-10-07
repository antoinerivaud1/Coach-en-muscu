# CM-85 partie A : duos et lien profils / comptes (opérations manuelles)

Checklist à dérouler **à la main**, dans l'ordre, par Antoine. Rien ici n'est
lancé par le code ni par la CI. On ne passe à l'étape suivante que si la
vérification est bonne.

- Projet Supabase : `drmmgwchoowggpsppilo` (prod, la seule base).
- Les requêtes se lancent dans Supabase, SQL Editor.
- Fichier SQL unique à coller : `supabase/ops/2026-10-cm85-partie-a.sql`
  (les deux migrations du repo, à l'identique, dans une transaction, avec une
  vérification finale).

## Ce que ça change

- `profiles.id` devient une clé étrangère vers `auth.users(id)`
  (`on delete cascade`) : un profil sans compte devient impossible.
- Nouvelles tables `duos`, `duo_members`, `duo_invitations` (RLS active, aucun
  droit pour `anon` ni `authenticated`).
- Le couple `33333333-…` est recopié en duo avec le même uuid et ses 2 membres.
- Colonne `duo_id` sur `programs` et `exercises`, égale à `couple_id`, tenue
  synchronisée par trigger dans les deux sens.
- Rien n'est supprimé : `couples`, `couple_members` et `couple_id` restent en
  place (suppression en partie B).

## ORDRE IMPÉRATIF

1. **D'abord** appliquer le SQL en prod (étapes 1 à 3 ci-dessous).
2. **Ensuite seulement** merger la PR et laisser Vercel déployer.

Le nouveau code lit `duo_members` et `duo_id` : déployé avant le SQL, il ne
trouverait pas de duo (bibliothèque de séances inaccessible, « Cette
fonctionnalité nécessite un couple »). L'ancien code, lui, continue de
fonctionner après le SQL (il lit et écrit `couple_id`, recopié dans `duo_id`).

## Étape 1 : vérifications avant

```sql
-- Aucune séance en cours (sinon attendre la fin de la séance).
select count(*) from public.sessions where duration_seconds is null;  -- 0

-- Chaque profil a son compte Auth (sinon la migration échouera, sans dégât).
select p.id, p.display_name, (u.id is not null) as a_un_compte
from public.profiles p left join auth.users u on u.id = p.id;
-- 2 lignes, a_un_compte = true partout

-- Comptages de référence (à noter).
select 'profiles' t, count(*) from public.profiles union all
select 'couples', count(*) from public.couples union all
select 'couple_members', count(*) from public.couple_members union all
select 'exercises', count(*) from public.exercises union all
select 'programs', count(*) from public.programs union all
select 'program_days', count(*) from public.program_days union all
select 'program_exercises', count(*) from public.program_exercises union all
select 'sessions', count(*) from public.sessions union all
select 'session_sets', count(*) from public.session_sets;
-- au 07/10 : 2, 1, 2, 81, 1, 3, 18, 9, 173

-- Les nouvelles tables n'existent pas encore.
select to_regclass('public.duos') is null as pas_encore_de_duos;  -- true
```

## Étape 2 : appliquer le SQL

Copier **tout** le contenu de `supabase/ops/2026-10-cm85-partie-a.sql` dans
le SQL Editor, puis Run.

- Si une erreur apparaît : rien n'a été appliqué (transaction annulée). Lire
  le message. « profils sans compte Auth (…) » : un profil n'a pas de compte,
  le créer d'abord. Ne pas passer à la suite.
- Sinon, le résultat est une seule ligne : **`ok` doit valoir `true`**. Les
  colonnes suivantes disent quel contrôle a échoué le cas échéant
  (`donnees_intactes`, `duo_3333_deux_membres`, `duos_egal_couples`,
  `duo_id_rempli`, `fk_profils_comptes`, `triggers_ok`, `securite_ok`).

Le fichier est rejouable : le relancer sur une base déjà migrée ne change rien.

## Étape 3 : vérifications après

```sql
-- Mêmes comptages qu'à l'étape 1.
select 'profiles' t, count(*) from public.profiles union all
select 'couples', count(*) from public.couples union all
select 'couple_members', count(*) from public.couple_members union all
select 'exercises', count(*) from public.exercises union all
select 'programs', count(*) from public.programs union all
select 'program_days', count(*) from public.program_days union all
select 'program_exercises', count(*) from public.program_exercises union all
select 'sessions', count(*) from public.sessions union all
select 'session_sets', count(*) from public.session_sets;

-- Le duo 33333333-… et ses 2 membres.
select d.id, d.name, m.profile_id
from public.duos d join public.duo_members m on m.duo_id = d.id;
-- 2 lignes, duo 33333333-…, profils 11111111-… et 22222222-…

-- programs.duo_id rempli (et égal à couple_id).
select id, name, owner_profile_id, couple_id, duo_id from public.programs;
-- « Nos séances » : couple_id = duo_id = 33333333-…

-- FK présente.
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.profiles'::regclass and conname = 'profiles_id_fkey';
-- FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
```

## Étape 4 : réaligner l'historique des migrations

Le SQL Editor n'enregistre rien dans `supabase_migrations.schema_migrations`.
L'historique de la prod porte encore les 14 versions d'avant le baseline
(`20260506183839` à `20260912211215`), alors que le repo a d'autres fichiers.
Cette étape ne touche **que** l'historique, jamais le schéma ni les données.
Depuis le Mac, à la racine du repo (mot de passe de la base demandé) :

```bash
npx supabase link --project-ref drmmgwchoowggpsppilo

# Versions de la prod qui n'existent pas dans le repo : retirées de l'historique.
npx supabase migration repair --status reverted \
  20260506183839 20260506183903 20260506183923 20260506184200 20260506184232 \
  20260506184742 20260613170036 20260615212659 20260619113051 20260619113408 \
  20260621200549 20260621201636 20260906140326 20260912211215

# Fichiers du repo, tous déjà appliqués en prod (baseline = état d'avant,
# CM-69, CM-78, trigger CM-58, puis les deux migrations CM-85 de ce jour).
npx supabase migration repair --status applied \
  20260506000000 20260812072300 20260912093000 20261006120000 \
  20261007090000 20261007090100

# Contrôle : colonnes Local et Remote identiques sur chaque ligne.
npx supabase migration list
```

Ne **pas** lancer `supabase db push` à la place : il tenterait de rejouer le
baseline, qui échoue volontairement sur la prod.

## Étape 5 : merger et déployer

1. CI de la PR verte (dont « Tests e2e (Supabase local) » et « Vérifications
   SQL (CM-85) »).
2. Merger : Vercel déploie la production.
3. Vérification (téléphone, compte d'Antoine puis de Léa) : accueil avec la
   grille de séances, Séances (bibliothèque « Nos séances »), démarrer puis
   abandonner une séance, Historique, Progression (comparaison à deux),
   Profil (nom du partenaire). Aucun changement visible attendu.

## Retour arrière

Code : sur Vercel, Deployments, re-promouvoir le déploiement d'avant le merge
(« Promote to Production »). L'ancien code fonctionne avec ou sans le SQL.

SQL (seulement **après** le retour arrière du code, sinon le code déployé
casse) : aucune donnée n'est perdue, les écritures faites entre-temps par le
nouveau code sont aussi dans `couple_id` grâce au trigger.

```sql
begin;
drop trigger if exists couples_sync_duos on public.couples;
drop trigger if exists couple_members_sync_duo_members on public.couple_members;
drop trigger if exists programs_sync_duo on public.programs;
drop trigger if exists exercises_sync_duo on public.exercises;
drop function if exists public.sync_couples_to_duos();
drop function if exists public.sync_couple_members_to_duo_members();
drop function if exists public.sync_couple_duo_id();
drop function if exists public.can_access_program(uuid);
drop function if exists public.visible_profile_ids();
drop function if exists public.is_duo_member(uuid);
drop function if exists public.my_duo_id();
alter table public.programs  drop column if exists duo_id;
alter table public.exercises drop column if exists duo_id;
drop table if exists public.duo_invitations, public.duo_members, public.duos;
drop function if exists public.duo_members_enforce_max();
alter table public.profiles drop constraint if exists profiles_id_fkey;
alter table public.profiles alter column id set default gen_random_uuid();
commit;
```

Puis, si l'étape 4 a été faite :
`npx supabase migration repair --status reverted 20261007090000 20261007090100`.

## À savoir

- Avec la FK, supprimer un compte dans Authentication, Users supprime son
  profil, ses séances et ses séries (cascades). C'est voulu (CM-60), mais à
  ne pas faire « pour tester » sur les comptes d'Antoine et de Léa.
- Un duo compte au plus 2 membres et un profil n'est que dans un seul duo :
  contraintes en base (trigger et index unique).
- Partie B (PR suivante, une fois celle-ci en prod et vérifiée) : suppression
  de `couples`, `couple_members`, `couple_id`, des triggers de synchro et des
  fonctions couple ; contrainte XOR sur `duo_id`.
