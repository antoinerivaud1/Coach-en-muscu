-- CM-99 (CM-85 partie B) : le modèle couple a disparu, le XOR passe sur duo_id.
-- Lancé par `supabase test db` (job e2e de la CI, après `supabase db reset`).
-- Joué en postgres (propriétaire des tables) : on teste le schéma et ses
-- contraintes, pas la RLS (voir rls.test.sql). Transaction annulée à la fin.

begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

-- 1. Tables et colonnes du modèle couple supprimées ----------------------------

select hasnt_table('public', 'couples',        '1. table couples supprimée');
select hasnt_table('public', 'couple_members', '1. table couple_members supprimée');
select hasnt_column('public', 'exercises', 'couple_id', '1. exercises.couple_id supprimée');
select hasnt_column('public', 'programs',  'couple_id', '1. programs.couple_id supprimée');
select has_column('public', 'exercises', 'duo_id', '1. exercises.duo_id présente');
select has_column('public', 'programs',  'duo_id', '1. programs.duo_id présente');

-- 2. Fonctions du modèle couple supprimées -------------------------------------

select hasnt_function('public', 'create_couple',                      '2. create_couple supprimée');
select hasnt_function('public', 'join_couple',                        '2. join_couple supprimée');
select hasnt_function('public', 'user_couple_id',                     '2. user_couple_id supprimée');
select hasnt_function('public', 'accessible_profile_ids',             '2. accessible_profile_ids supprimée');
select hasnt_function('public', 'sync_couple_duo_id',                 '2. sync_couple_duo_id supprimée');
select hasnt_function('public', 'sync_couples_to_duos',               '2. sync_couples_to_duos supprimée');
select hasnt_function('public', 'sync_couple_members_to_duo_members', '2. sync_couple_members_to_duo_members supprimée');
select is((select count(*)::int from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname ilike '%couple%'),
          0, '2. aucune fonction %couple% dans public');

-- 3. Triggers : synchro supprimée, garde-fous conservés ------------------------

select hasnt_trigger('public', 'programs',  'programs_sync_duo',  '3. programs_sync_duo supprimé');
select hasnt_trigger('public', 'exercises', 'exercises_sync_duo', '3. exercises_sync_duo supprimé');
select has_trigger('public', 'duo_members', 'duo_members_max_two', '3. duo_members_max_two conservé');
select has_trigger('auth', 'users', 'on_auth_user_created', '3. on_auth_user_created conservé');

-- 4. XOR owner_profile_id / duo_id sur programs --------------------------------

select ok(exists (select 1 from pg_constraint
                  where conrelid = 'public.programs'::regclass
                    and conname = 'programs_owner_xor_duo'
                    and contype = 'c' and convalidated),
          '4. contrainte programs_owner_xor_duo présente et validée');
select ok(not exists (select 1 from pg_constraint
                      where conrelid = 'public.programs'::regclass
                        and conname = 'program_owner_xor'),
          '4. ancienne contrainte program_owner_xor supprimée');

select throws_ok(
  $$ insert into public.programs (name, owner_profile_id, duo_id)
     values ('Hybride', '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333') $$,
  '23514', null, '4. owner_profile_id ET duo_id refusé');
select throws_ok(
  $$ insert into public.programs (name) values ('Orphelin') $$,
  '23514', null, '4. ni owner_profile_id ni duo_id refusé');
select throws_ok(
  $$ update public.programs set owner_profile_id = '11111111-1111-1111-1111-111111111111'
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', null, '4. programme du duo rendu aussi perso : refusé');
select lives_ok(
  $$ insert into public.programs (name, owner_profile_id)
     values ('Perso (test)', '11111111-1111-1111-1111-111111111111') $$,
  '4. programme perso accepté');
select lives_ok(
  $$ insert into public.programs (name, duo_id)
     values ('Duo (test)', '33333333-3333-3333-3333-333333333333') $$,
  '4. programme du duo accepté');

-- 5. Index sur duo_id -------------------------------------------------------------

select ok(exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'programs'
                    and indexdef ilike '%(duo_id)%')
          and exists (select 1 from pg_indexes
                      where schemaname = 'public' and tablename = 'exercises'
                        and indexdef ilike '%(duo_id)%'),
          '5. index sur programs.duo_id et exercises.duo_id');

select * from finish();

rollback;
