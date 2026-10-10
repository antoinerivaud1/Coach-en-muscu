-- CM-86 / CM-87 socle : couleur de membre, avatar, onboarded_at, objectif
-- hebdo 1 à 7, exercices perso (exercises.owner_profile_id).
-- Lancé par `supabase test db` (job e2e de la CI, après `supabase db reset`).
--
-- Comptes du seed (supabase/seed.sql) :
--   Toi  11111111-1111-1111-1111-111111111111  membre du duo 3333…
--   Elle 22222222-2222-2222-2222-222222222222  membre du duo 3333…
--   Solo 44444444-4444-4444-4444-444444444444  hors duo, 1 exercice perso
-- Schéma joué en postgres ; RLS jouée sous `authenticated` (jeton simulé par
-- request.jwt.claims), `reset role` entre les cas. Transaction annulée.

begin;

create extension if not exists pgtap with schema extensions;

select plan(39);

-- ---------------------------------------------------------------------------
-- 1. Colonnes, contraintes, index, policies.
-- ---------------------------------------------------------------------------

select has_column('public', 'profiles', 'accent_color', '1. profiles.accent_color présente');
select col_not_null('public', 'profiles', 'accent_color', '1. accent_color not null');
select col_default_is('public', 'profiles', 'accent_color', '#2FE6FF', '1. accent_color : défaut cyan');
select has_column('public', 'profiles', 'avatar_url', '1. profiles.avatar_url présente');
select col_is_null('public', 'profiles', 'avatar_url', '1. avatar_url facultative');
select has_column('public', 'profiles', 'onboarded_at', '1. profiles.onboarded_at présente');
select col_type_is('public', 'profiles', 'onboarded_at', 'timestamp with time zone',
                   '1. onboarded_at en timestamptz');
select has_column('public', 'profiles', 'color_role', '1. color_role conservée (retrait plus tard)');
select has_column('public', 'exercises', 'owner_profile_id', '1. exercises.owner_profile_id présente');
select fk_ok('public', 'exercises', 'owner_profile_id', 'public', 'profiles', 'id',
             '1. owner_profile_id référence profiles(id)');
select ok(exists (select 1 from pg_constraint
                  where conrelid = 'public.exercises'::regclass
                    and conname = 'exercises_owner_profile_id_fkey'
                    and confdeltype = 'c'),
          '1. owner_profile_id : on delete cascade');
select ok(exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass
                    and conname = 'profiles_accent_color_palette' and convalidated),
          '1. contrainte profiles_accent_color_palette');
select ok(exists (select 1 from pg_constraint
                  where conrelid = 'public.profiles'::regclass
                    and conname = 'profiles_weekly_goal_range' and convalidated
                    and pg_get_constraintdef(oid) ilike '%7%'),
          '1. contrainte profiles_weekly_goal_range (1 à 7)');
select ok(exists (select 1 from pg_constraint
                  where conrelid = 'public.exercises'::regclass
                    and conname = 'exercises_owner_or_duo' and convalidated),
          '1. contrainte exercises_owner_or_duo');
select ok(exists (select 1 from pg_indexes
                  where schemaname = 'public' and tablename = 'exercises'
                    and indexdef ilike '%(owner_profile_id)%'),
          '1. index sur exercises.owner_profile_id');
select is((select count(*)::int from pg_policies where schemaname = 'public'),
          22, '1. toujours 22 policies dans public');
select policies_are('public', 'exercises',
  array['exercises_select_system_owner_or_duo', 'exercises_insert_owner_or_duo',
        'exercises_update_owner_or_duo', 'exercises_delete_owner_or_duo'],
  '1. les 4 policies d''exercises réécrites');

-- ---------------------------------------------------------------------------
-- 2. Seed : couleurs, onboarding, exercice perso de Solo.
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select id::text, accent_color, onboarded_at is not null
     from public.profiles
     where id in ('11111111-1111-1111-1111-111111111111',
                  '22222222-2222-2222-2222-222222222222',
                  '44444444-4444-4444-4444-444444444444')
     order by id $$,
  $$ values ('11111111-1111-1111-1111-111111111111', '#2FE6FF', true),
            ('22222222-2222-2222-2222-222222222222', '#FF4F7E', true),
            ('44444444-4444-4444-4444-444444444444', '#FF8A3D', true) $$,
  '2. seed : couleurs de Toi, Elle, Solo et onboarding fait');

-- Exercice perso de Toi (pour le cas 5), créé en postgres.
insert into public.exercises (id, name, muscle_group, owner_profile_id) values
  ('aaaaaaaa-8686-0000-0000-000000000001', 'Exercice perso de Toi (test)', 'other',
   '11111111-1111-1111-1111-111111111111');

-- Nouvel inscrit : pas encore onboardé, couleur et objectif par défaut.
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-8686-0000-0000-000000000002',
   'authenticated', 'authenticated', 'cm86@coach-en-muscu.test', '{"display_name":"Nouveau"}');
select results_eq(
  $$ select accent_color, onboarded_at is null, weekly_goal from public.profiles
     where id = 'aaaaaaaa-8686-0000-0000-000000000002' $$,
  $$ values ('#2FE6FF', true, 3) $$,
  '2. nouvel inscrit : cyan, onboarded_at null, objectif 3');

-- ---------------------------------------------------------------------------
-- 3. Solo crée un exercice perso et le voit.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select lives_ok(
  $$ insert into public.exercises (id, name, muscle_group, owner_profile_id)
     values ('aaaaaaaa-8686-0000-0000-000000000003', 'Perso Solo (test)', 'other',
             '44444444-4444-4444-4444-444444444444') $$,
  '3. Solo crée un exercice perso (owner_profile_id = Solo, duo_id null)');
select is((select count(*)::int from public.exercises
           where owner_profile_id = '44444444-4444-4444-4444-444444444444'),
          2, '3. Solo voit ses 2 exercices perso (seed + créé)');

-- ---------------------------------------------------------------------------
-- 4. Écritures interdites pour Solo.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.exercises (name, muscle_group, owner_profile_id)
     values ('Au nom de Toi', 'other', '11111111-1111-1111-1111-111111111111') $$,
  '42501', null, '4. Solo ne crée pas d''exercice perso au nom de Toi');
select throws_ok(
  $$ insert into public.exercises (name, muscle_group) values ('Faux système', 'other') $$,
  '42501', null, '4. Solo ne crée pas d''exercice système');
select lives_ok(
  $$ update public.exercises set name = 'Piraté'
     where id = '5c691ede-719c-4f3a-b714-34f91005f3dd' $$,
  '4. update d''un exercice système sans erreur');
select is((select name from public.exercises where id = '5c691ede-719c-4f3a-b714-34f91005f3dd'),
          'Développé couché barre', '4. exercice système inchangé (0 ligne)');
select throws_ok(
  $$ update public.exercises set owner_profile_id = null
     where id = 'aaaaaaaa-8686-0000-0000-000000000003' $$,
  '42501', null, '4. Solo ne transforme pas son exercice perso en exercice système');

-- ---------------------------------------------------------------------------
-- 5. Cloisonnement des exercices perso.
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.exercises
           where id = 'aaaaaaaa-8686-0000-0000-000000000001'),
          0, '5. Solo ne voit pas l''exercice perso de Toi');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.exercises
           where owner_profile_id = '44444444-4444-4444-4444-444444444444'),
          0, '5. Toi ne voit pas les exercices perso de Solo');
select is((select count(*)::int from public.exercises
           where id = 'aaaaaaaa-8686-0000-0000-000000000001'),
          1, '5. Toi voit son propre exercice perso');

-- ---------------------------------------------------------------------------
-- 6. owner_profile_id ET duo_id : refusé (policy, puis contrainte).
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.exercises (name, muscle_group, owner_profile_id, duo_id)
     values ('Hybride', 'other', '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333') $$,
  '42501', null, '6. owner_profile_id ET duo_id refusé (RLS)');

reset role;

select throws_ok(
  $$ insert into public.exercises (name, muscle_group, owner_profile_id, duo_id)
     values ('Hybride', 'other', '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333') $$,
  '23514', null, '6. owner_profile_id ET duo_id refusé (contrainte, même en postgres)');

-- ---------------------------------------------------------------------------
-- 7. Profil : couleur, avatar, onboarding, objectif.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select throws_ok(
  $$ update public.profiles set accent_color = '#000000'
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', null, '7. accent_color hors palette refusée');
select lives_ok(
  $$ update public.profiles
       set accent_color = '#A78BFA', avatar_url = 'avatars/solo.png', onboarded_at = now()
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '7. Solo met à jour sa couleur, son avatar et onboarded_at');
select is((select accent_color from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
          '#A78BFA', '7. couleur de Solo mise à jour');
select throws_ok(
  $$ update public.profiles set weekly_goal = 8
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', null, '7. weekly_goal 8 refusé');
select throws_ok(
  $$ update public.profiles set weekly_goal = 0
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '23514', null, '7. weekly_goal 0 refusé');
select lives_ok(
  $$ update public.profiles set weekly_goal = 7
     where id = '44444444-4444-4444-4444-444444444444' $$,
  '7. weekly_goal 7 accepté');
select lives_ok(
  $$ update public.profiles set accent_color = '#FFD23F'
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '7. update de la couleur de Toi par Solo sans erreur');

reset role;

select is((select accent_color from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
          '#2FE6FF', '7. couleur de Toi inchangée (0 ligne)');

select * from finish();

rollback;
