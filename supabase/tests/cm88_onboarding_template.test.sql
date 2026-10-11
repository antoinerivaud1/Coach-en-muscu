-- CM-88 (PR 7) : apply_onboarding_template (modèle de séances de
-- l'onboarding, en une transaction). Lancé par `supabase test db` (job e2e
-- de la CI, après `supabase db reset`).
--
-- Comptes du seed (supabase/seed.sql) :
--   Toi  11111111-…  membre du duo 3333… (bibliothèque du duo)
--   Solo 44444444-…  hors duo, programme perso (« Full body »)
--   Duo2 55555555-…  hors duo, sans données
-- Les comptages sont relatifs (avant / après) : le test tient aussi sur une
-- base locale déjà utilisée par les e2e.
--
-- RLS jouée sous `authenticated` (jeton simulé par request.jwt.claims),
-- `reset role` entre les cas. Transaction annulée.

begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- ---------------------------------------------------------------------------
-- Outils (postgres)
-- ---------------------------------------------------------------------------

-- Séances types de la bibliothèque perso d'un profil.
create function pg_temp.days_of(p_profile uuid)
 returns bigint
 language sql
as $$
  select count(*) from public.program_days d
  join public.programs p on p.id = d.program_id
  where p.owner_profile_id = p_profile and p.duo_id is null
$$;

-- Lignes de la bibliothèque perso de Duo2 (programmes, séances types,
-- exercices). Limité à Duo2 : sur une base locale partagée, d'autres
-- parcours peuvent écrire ailleurs pendant le test.
create function pg_temp.library_rows()
 returns bigint
 language sql
as $$
  select (select count(*) from public.programs
          where owner_profile_id = '55555555-5555-5555-5555-555555555555')
       + (select count(*) from public.program_days d
          join public.programs p on p.id = d.program_id
          where p.owner_profile_id = '55555555-5555-5555-5555-555555555555')
       + (select count(*) from public.program_exercises pe
          join public.program_days d on d.id = pe.program_day_id
          join public.programs p on p.id = d.program_id
          where p.owner_profile_id = '55555555-5555-5555-5555-555555555555')
$$;

create temp table ref (k text primary key, n bigint);
grant all on ref to authenticated;

-- Modèle valide : une séance avec 2 exercices du catalogue (+ 1 inconnu,
-- ignoré) et une séance dont aucun exercice n'existe (non créée).
create function pg_temp.tpl(p_name text)
 returns jsonb
 language sql
as $$
  select jsonb_build_array(
    jsonb_build_object('name', p_name, 'exercises', jsonb_build_array(
      jsonb_build_object('name', 'Squat barre', 'sets', 4, 'repsMin', 6, 'repsMax', 8, 'restSeconds', 150),
      jsonb_build_object('name', 'Exercice qui n''existe pas', 'sets', 3, 'repsMin', 8, 'repsMax', 12, 'restSeconds', 90),
      jsonb_build_object('name', 'Développé couché barre', 'sets', 3, 'repsMin', 8, 'repsMax', 12, 'restSeconds', 90))),
    jsonb_build_object('name', 'Fantôme', 'exercises', jsonb_build_array(
      jsonb_build_object('name', 'Inconnu', 'sets', 3, 'repsMin', 8, 'repsMax', 12, 'restSeconds', 90))))
$$;

-- ---------------------------------------------------------------------------
-- 1. Fonction et droits
-- ---------------------------------------------------------------------------

select has_function('public', 'apply_onboarding_template', array['jsonb'],
  '1. apply_onboarding_template(jsonb) présente');
select ok(not (select prosecdef from pg_proc
               where oid = 'public.apply_onboarding_template(jsonb)'::regprocedure),
  '1. security invoker (la RLS s''applique)');
select ok((select proconfig @> array['search_path=""'] from pg_proc
           where oid = 'public.apply_onboarding_template(jsonb)'::regprocedure),
  '1. search_path vide');
select ok(has_function_privilege('authenticated', 'public.apply_onboarding_template(jsonb)', 'execute'),
  '1. EXECUTE pour authenticated');
select ok(not has_function_privilege('anon', 'public.apply_onboarding_template(jsonb)', 'execute'),
  '1. pas d''EXECUTE pour anon');
select is((select count(*)::int from pg_policies where schemaname = 'public'),
  22, '1. toujours 22 policies dans public');

-- Duo2 pas encore onboardé (comme un compte qui vient de s'inscrire).
update public.profiles set onboarded_at = null
  where id = '55555555-5555-5555-5555-555555555555';
insert into ref values
  ('duo2_days', pg_temp.days_of('55555555-5555-5555-5555-555555555555')),
  ('solo_days', pg_temp.days_of('44444444-4444-4444-4444-444444444444')),
  ('library', pg_temp.library_rows()),
  ('toi_duo_days', (select count(*) from public.program_days d
                    join public.programs p on p.id = d.program_id
                    where p.duo_id = '33333333-3333-3333-3333-333333333333'));

-- ---------------------------------------------------------------------------
-- 2. Refus : anon, sans compte, modèle invalide ou vide. Rien d'écrit.
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.apply_onboarding_template(pg_temp.tpl('Push')) $$,
  '42501', null, '2. anon : refusé (permission)');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$ select public.apply_onboarding_template(pg_temp.tpl('Push')) $$,
  'P0001', 'cm88:not_authenticated', '2. sans compte : not_authenticated');

set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select throws_ok($$ select public.apply_onboarding_template('{}'::jsonb) $$,
  'P0001', 'cm88:template_invalid', '2. pas un tableau : template_invalid');
select throws_ok($$ select public.apply_onboarding_template('[]'::jsonb) $$,
  'P0001', 'cm88:template_invalid', '2. tableau vide : template_invalid');
-- Seconde séance invalide APRÈS une première séance déjà écrite : tout
-- est annulé.
select throws_ok(
  $$ select public.apply_onboarding_template(
       pg_temp.tpl('Push') || '[{"name": "  ", "exercises": []}]'::jsonb) $$,
  'P0001', 'cm88:template_invalid', '2. séance sans nom après une séance écrite : template_invalid');
select throws_ok(
  $$ select public.apply_onboarding_template(
       '[{"name": "Fantôme", "exercises": [{"name": "Inconnu", "sets": 3, "repsMin": 8, "repsMax": 12, "restSeconds": 90}]}]'::jsonb) $$,
  'P0001', 'cm88:template_empty', '2. aucun exercice trouvé : template_empty');

reset role;
select is(pg_temp.library_rows(), (select n from ref where k = 'library'),
  '2. après les refus : aucune ligne de bibliothèque écrite');
select ok((select onboarded_at is null from public.profiles
           where id = '55555555-5555-5555-5555-555555555555'),
  '2. après les refus : onboarding toujours pas terminé');

-- ---------------------------------------------------------------------------
-- 3. Duo2 ajoute le modèle : bibliothèque perso, onboarding terminé.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select is(public.apply_onboarding_template(pg_temp.tpl('Corps entier')), 1,
  '3. une séance type créée (la séance sans exercice connu est ignorée)');
reset role;

select is(pg_temp.days_of('55555555-5555-5555-5555-555555555555'),
  (select n from ref where k = 'duo2_days') + 1, '3. dans la bibliothèque PERSO de Duo2');
select results_eq(
  $$ select e.name, pe.order_index, pe.target_sets, pe.target_reps_min, pe.target_reps_max, pe.rest_seconds
     from public.program_exercises pe
     join public.exercises e on e.id = pe.exercise_id
     join public.program_days d on d.id = pe.program_day_id
     join public.programs p on p.id = d.program_id
     where p.owner_profile_id = '55555555-5555-5555-5555-555555555555' and d.name = 'Corps entier'
     order by pe.order_index $$,
  $$ values ('Squat barre'::text, 0, 4, 6, 8, 150), ('Développé couché barre'::text, 1, 3, 8, 12, 90) $$,
  '3. exercices du catalogue dans l''ordre, prescriptions reprises, inconnu ignoré');
select ok((select onboarded_at is not null from public.profiles
           where id = '55555555-5555-5555-5555-555555555555'),
  '3. onboarding terminé (onboarded_at posé)');

-- Nom déjà pris (sans casse ni accents) : « … 2 ».
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select is(public.apply_onboarding_template(pg_temp.tpl('CORPS ENTIER')), 1,
  '3. second ajout du même modèle');
reset role;
select ok(exists (select 1 from public.program_days d
                  join public.programs p on p.id = d.program_id
                  where p.owner_profile_id = '55555555-5555-5555-5555-555555555555'
                    and d.name = 'CORPS ENTIER 2'),
  '3. nom libre « CORPS ENTIER 2 »');

-- ---------------------------------------------------------------------------
-- 4. Un autre compte (Solo) : n'écrit que chez lui.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is(public.apply_onboarding_template(pg_temp.tpl('Full body')), 1,
  '4. Solo ajoute le modèle');
reset role;
select is(pg_temp.days_of('44444444-4444-4444-4444-444444444444'),
  (select n from ref where k = 'solo_days') + 1, '4. dans la bibliothèque perso de Solo (« Full body 2 »)');
select is(pg_temp.days_of('55555555-5555-5555-5555-555555555555'),
  (select n from ref where k = 'duo2_days') + 2, '4. bibliothèque de Duo2 inchangée par Solo');
select is((select count(*) from public.program_days d
           join public.programs p on p.id = d.program_id
           where p.duo_id = '33333333-3333-3333-3333-333333333333'),
  (select n from ref where k = 'toi_duo_days'), '4. bibliothèque du duo Théo / Lina inchangée');

select * from finish();
rollback;
