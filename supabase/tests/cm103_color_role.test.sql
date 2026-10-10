-- CM-103 : retrait de profiles.color_role (migration 20261011120000).
-- Lancé par `supabase test db` (job e2e de la CI, après `supabase db reset`).
-- Joué en postgres, transaction annulée à la fin.

begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

-- 1. Colonne, type, droit -------------------------------------------------------

select hasnt_column('public', 'profiles', 'color_role', '1. profiles.color_role supprimée');
select hasnt_type('public', 'color_role', '1. type public.color_role supprimé');
select has_column('public', 'profiles', 'accent_color', '1. accent_color toujours là');
select col_not_null('public', 'profiles', 'accent_color', '1. accent_color not null');
select is(
  (select array_agg(column_name::text order by column_name::text)
   from information_schema.column_privileges
   where table_schema = 'public' and table_name = 'profiles'
     and grantee = 'authenticated' and privilege_type = 'UPDATE'),
  array['accent_color', 'avatar_url', 'display_name', 'onboarded_at', 'weekly_goal'],
  '1. authenticated : UPDATE sur les 5 colonnes de profil, plus color_role');

-- 2. Fonctions ------------------------------------------------------------------

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosrc ~* 'color_role'),
  0, '2. aucune fonction de public ne cite color_role');
select ok(
  (select prosecdef and proconfig @> array['search_path=""']
   from pg_proc where oid = 'public.handle_new_user()'::regprocedure),
  '2. handle_new_user : security definer, search_path vide');

-- 3. Inscription : le trigger crée toujours le profil ----------------------------

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0103-0000-0000-000000000001',
   'authenticated', 'authenticated', 'camille.cm103@coach-en-muscu.test',
   '{"display_name":"Camille","color_role":"elle"}');
select results_eq(
  $$ select display_name, accent_color, onboarded_at is null, weekly_goal
     from public.profiles where id = 'aaaaaaaa-0103-0000-0000-000000000001' $$,
  $$ values ('Camille'::text, '#2FE6FF'::text, true, 3) $$,
  '3. nouvel inscrit : prénom des métadonnées, cyan (color_role ignorée), objectif 3');

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0103-0000-0000-000000000002',
   'authenticated', 'authenticated', 'sacha.cm103@coach-en-muscu.test', '{}');
select is(
  (select display_name from public.profiles where id = 'aaaaaaaa-0103-0000-0000-000000000002'),
  'sacha.cm103', '3. sans prénom : début de l''email');

select * from finish();
rollback;
