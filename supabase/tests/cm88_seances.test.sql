-- CM-88 (PR 5) : RPC des séances types (save_seance, duplicate_seance,
-- move_seance). Lancé par `supabase test db` (job e2e de la CI, après
-- `supabase db reset`).
--
-- Indépendant du seed : comptes, duo et exercices créés ici (ids
-- cccccccc-8888-…), pour pouvoir aussi tourner sur une base locale déjà
-- utilisée par les e2e.
--   A  (…a1) solo
--   B  (…b1) et C (…c1) : duo actif D1 (…d1)
--   X  (…e1) solo, étranger à tout ce qui précède
--   P  (…f1) seul dans le duo D2 (…d2) : invitation en attente = solo
-- RLS jouée sous `authenticated` (jeton simulé par request.jwt.claims),
-- `reset role` entre les cas. Transaction annulée : la base reste intacte.

begin;

create extension if not exists pgtap with schema extensions;

select plan(84);

-- ---------------------------------------------------------------------------
-- Données de test (postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-8888-0000-0000-0000000000a1',
   'authenticated', 'authenticated', 'cm88-a@coach-en-muscu.test', '{"display_name":"A"}'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-8888-0000-0000-0000000000b1',
   'authenticated', 'authenticated', 'cm88-b@coach-en-muscu.test', '{"display_name":"B"}'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-8888-0000-0000-0000000000c1',
   'authenticated', 'authenticated', 'cm88-c@coach-en-muscu.test', '{"display_name":"C"}'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-8888-0000-0000-0000000000e1',
   'authenticated', 'authenticated', 'cm88-x@coach-en-muscu.test', '{"display_name":"X"}'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-8888-0000-0000-0000000000f1',
   'authenticated', 'authenticated', 'cm88-p@coach-en-muscu.test', '{"display_name":"P"}');

insert into public.duos (id, name) values
  ('cccccccc-8888-0000-0000-0000000000d1', 'Duo CM-88'),
  ('cccccccc-8888-0000-0000-0000000000d2', 'Duo CM-88 en attente');
insert into public.duo_members (duo_id, profile_id) values
  ('cccccccc-8888-0000-0000-0000000000d1', 'cccccccc-8888-0000-0000-0000000000b1'),
  ('cccccccc-8888-0000-0000-0000000000d1', 'cccccccc-8888-0000-0000-0000000000c1'),
  ('cccccccc-8888-0000-0000-0000000000d2', 'cccccccc-8888-0000-0000-0000000000f1');

-- Exercices système S1..S3, perso PA (A), PB et PB2 (B), PX (X).
insert into public.exercises (id, name, muscle_group) values
  ('cccccccc-8888-0000-0000-000000000e01', 'CM-88 système 1', 'chest'),
  ('cccccccc-8888-0000-0000-000000000e02', 'CM-88 système 2', 'back'),
  ('cccccccc-8888-0000-0000-000000000e03', 'CM-88 système 3', 'quads');
insert into public.exercises (id, name, muscle_group, owner_profile_id) values
  ('cccccccc-8888-0000-0000-000000000e11', 'CM-88 perso A', 'other', 'cccccccc-8888-0000-0000-0000000000a1'),
  ('cccccccc-8888-0000-0000-000000000e21', 'CM-88 perso B', 'other', 'cccccccc-8888-0000-0000-0000000000b1'),
  ('cccccccc-8888-0000-0000-000000000e22', 'CM-88 perso B 2', 'other', 'cccccccc-8888-0000-0000-0000000000b1'),
  ('cccccccc-8888-0000-0000-000000000e31', 'CM-88 perso X', 'other', 'cccccccc-8888-0000-0000-0000000000e1');

-- Résultats lus pendant les cas.
create temp table t_res (k text primary key, day_id uuid, program_id uuid, copied boolean);
grant all on t_res to authenticated;

-- Exercices d'une séance type, lisibles d'un coup : « id:ordre:séries:min:max:repos ».
create function pg_temp.cm88_exs(p_day uuid)
 returns text[]
 language sql
as $$
  select coalesce(array_agg(
           right(pe.exercise_id::text, 3) || ':' || pe.order_index || ':' || pe.target_sets
           || ':' || pe.target_reps_min || ':' || pe.target_reps_max || ':' || pe.rest_seconds
           order by pe.order_index), '{}')
  from public.program_exercises pe where pe.program_day_id = p_day
$$;
grant execute on function pg_temp.cm88_exs(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Structure et droits
-- ---------------------------------------------------------------------------

select ok((select count(*) = 4 and bool_and(not p.prosecdef and p.proconfig @> array['search_path=""'])
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('save_seance', 'duplicate_seance', 'move_seance', 'delete_seance')),
          '1. quatre RPC, security invoker, search_path vide');
select ok(has_function_privilege('authenticated', 'public.save_seance(uuid, text, jsonb, text, text)', 'execute')
          and has_function_privilege('authenticated', 'public.duplicate_seance(uuid)', 'execute')
          and has_function_privilege('authenticated', 'public.move_seance(uuid, text)', 'execute')
          and has_function_privilege('authenticated', 'public.delete_seance(uuid)', 'execute'),
          '1. authenticated exécute les RPC');
select ok(not has_function_privilege('anon', 'public.save_seance(uuid, text, jsonb, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.duplicate_seance(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.move_seance(uuid, text)', 'execute')
          and not has_function_privilege('anon', 'public.delete_seance(uuid)', 'execute'),
          '1. anon n''exécute aucune RPC');
select is((select count(*)::int from pg_policies where schemaname = 'public'), 22,
          '1. toujours 22 policies dans public');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from public.save_seance(null, 'X', '[]'::jsonb) $$, '42501', null,
                 '1. anon : save_seance refusé');
reset role;

-- ---------------------------------------------------------------------------
-- 2. A (solo) crée une séance : programme perso créé en silence
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok($$
  insert into t_res select 'a1', * from public.save_seance(null, '  Push  ', '[
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":4,"target_reps_min":6,"target_reps_max":8,"rest_seconds":150},
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e11","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}
  ]'::jsonb) $$, '2. A crée « Push »');
select ok((select owner_profile_id = 'cccccccc-8888-0000-0000-0000000000a1' and duo_id is null
                  and name = 'Mes séances'
           from public.programs where id = (select program_id from t_res where k = 'a1')),
          '2. programme perso « Mes séances » créé à son nom');
select is((select name || '#' || order_index from public.program_days
           where id = (select day_id from t_res where k = 'a1')),
          'Push#0', '2. nom nettoyé, première de la bibliothèque');
select is(pg_temp.cm88_exs((select day_id from t_res where k = 'a1')),
          array['e01:0:4:6:8:150', 'e11:1:3:8:12:90'], '2. exercices dans l''ordre reçu');
select is((select copied from t_res where k = 'a1'), false, '2. pas de copie');

-- Refus, rien d'écrit.
select throws_ok($$ select * from public.save_seance(null, 'PUSH ', '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:name_taken', '2. nom déjà pris (casse ignorée)');
select throws_ok($$ select * from public.save_seance(null, 'Autre', '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]', 'duo') $$,
                 'P0001', 'cm88:stale_duo', '2. « Pour qui ? » reçu en solo : page périmée');
select throws_ok($$ select * from public.save_seance(null, 'Autre', '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e31","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:exercise_not_in_catalog', '2. exercice perso d''un autre compte refusé');
select throws_ok($$ select * from public.save_seance(null, 'Autre', '[]') $$,
                 'P0001', 'cm88:no_exercises', '2. aucun exercice');
select throws_ok($$ select * from public.save_seance(null, 'Autre', '[
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90},
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:exercise_duplicate', '2. exercice en double');
select throws_ok($$ select * from public.save_seance(null, 'Autre', '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":11,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:exercise_bounds', '2. séries au-delà de 10');
select throws_ok($$ select * from public.save_seance(null, 'Autre', '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":2.5,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:exercise_bounds', '2. séries non entières');
select throws_ok($$ select * from public.save_seance(null, 'Autre', '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":12,"target_reps_max":8,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:reps_order', '2. minimum de répétitions au-dessus du maximum');
select throws_ok($$ select * from public.save_seance(null, repeat('a', 41), '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:name_too_long', '2. nom de 41 caractères');
select throws_ok($$ select * from public.save_seance(null, '   ', '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:name_required', '2. nom vide');
select throws_ok($$ select * from public.save_seance(null, 'Autre', '[{"exercise_id":"abc","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:exercise_invalid', '2. id d''exercice invalide');
select throws_ok($$ select * from public.save_seance(null, 'Autre', '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]', 'nous') $$,
                 'P0001', 'cm88:invalid_input', '2. choix inconnu');
select is((select count(*)::int from public.program_days d join public.programs p on p.id = d.program_id
           where p.owner_profile_id = 'cccccccc-8888-0000-0000-0000000000a1'), 1,
          '2. après les refus : toujours une seule séance type, rien d''écrit');
reset role;

-- ---------------------------------------------------------------------------
-- 3. X (étranger) ne touche pas aux séances de A
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000e1","role":"authenticated"}';

select throws_ok($$ select * from public.save_seance((select day_id from t_res where k = 'a1'), 'Pirate',
                   '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:seance_not_found', '3. X : édition de la séance de A refusée');
select throws_ok($$ select public.duplicate_seance((select day_id from t_res where k = 'a1')) $$,
                 'P0001', 'cm88:seance_not_found', '3. X : duplication refusée');
select throws_ok($$ select public.move_seance((select day_id from t_res where k = 'a1'), 'up') $$,
                 'P0001', 'cm88:seance_not_found', '3. X : réordonnancement refusé');
select throws_ok($$ select * from public.save_seance(null, 'Avec PA',
                   '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e11","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:exercise_not_in_catalog', '3. X : exercice perso de A refusé');
reset role;

select is(pg_temp.cm88_exs((select day_id from t_res where k = 'a1')),
          array['e01:0:4:6:8:150', 'e11:1:3:8:12:90'], '3. séance de A intacte');
select is((select count(*)::int from public.programs where owner_profile_id = 'cccccccc-8888-0000-0000-0000000000e1'),
          0, '3. aucun programme créé pour X (refus avant toute écriture)');

-- ---------------------------------------------------------------------------
-- 4. A modifie, duplique, réordonne
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok($$
  insert into t_res select 'a1e', * from public.save_seance((select day_id from t_res where k = 'a1'), 'push', '[
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e02","target_sets":3,"target_reps_min":10,"target_reps_max":12,"rest_seconds":60},
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":5,"target_reps_min":5,"target_reps_max":5,"rest_seconds":180}
  ]'::jsonb) $$, '4. A modifie « Push » (son propre nom, autre casse : accepté)');
select is((select day_id from t_res where k = 'a1e'), (select day_id from t_res where k = 'a1'),
          '4. même séance type');
select is(pg_temp.cm88_exs((select day_id from t_res where k = 'a1')),
          array['e02:0:3:10:12:60', 'e01:1:5:5:5:180'], '4. exercices remplacés, dans le nouvel ordre');

select lives_ok($$ insert into t_res (k, day_id) select 'a2', public.duplicate_seance((select day_id from t_res where k = 'a1')) $$,
                '4. A duplique « push »');
select is((select name || '#' || order_index from public.program_days where id = (select day_id from t_res where k = 'a2')),
          'push (copie)#1', '4. copie nommée et placée en fin de liste');
select is(pg_temp.cm88_exs((select day_id from t_res where k = 'a2')),
          pg_temp.cm88_exs((select day_id from t_res where k = 'a1')), '4. copie : mêmes exercices, mêmes cibles');

select lives_ok($$ select public.move_seance((select day_id from t_res where k = 'a2'), 'up') $$, '4. A monte la copie');
select is((select array_agg(name order by order_index) from public.program_days
           where program_id = (select program_id from t_res where k = 'a1')),
          array['push (copie)', 'push'], '4. ordre inversé');
select lives_ok($$ select public.move_seance((select day_id from t_res where k = 'a2'), 'up') $$, '4. déjà en tête : sans erreur');
select is((select array_agg(name || '#' || order_index order by order_index) from public.program_days
           where program_id = (select program_id from t_res where k = 'a1')),
          array['push (copie)#0', 'push#1'], '4. en butée : rien ne bouge');
select throws_ok($$ select public.move_seance((select day_id from t_res where k = 'a2'), 'gauche') $$,
                 'P0001', 'cm88:invalid_input', '4. direction inconnue');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Duo B / C : « Pour nous deux », « Pour moi », partager, garder pour moi
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000b1","role":"authenticated"}';

select lives_ok($$
  insert into t_res select 'b1', * from public.save_seance(null, 'Duo un', '[
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":4,"target_reps_min":6,"target_reps_max":8,"rest_seconds":150},
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e21","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}
  ]'::jsonb) $$, '5. B crée « Duo un » (choix par défaut)');
select ok((select duo_id = 'cccccccc-8888-0000-0000-0000000000d1' and owner_profile_id is null and name = 'Nos séances'
           from public.programs where id = (select program_id from t_res where k = 'b1')),
          '5. rangée dans « Nos séances », créée en silence');
select ok((select duo_id = 'cccccccc-8888-0000-0000-0000000000d1' and owner_profile_id is null
           from public.exercises where id = 'cccccccc-8888-0000-0000-000000000e21'),
          '5. l''exercice perso de B devient un exercice du duo');
select lives_ok($$
  insert into t_res select 'b2', * from public.save_seance(null, 'Perso deux', '[
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e22","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}
  ]'::jsonb, 'perso') $$, '5. B crée « Perso deux » pour lui');
select ok((select p.owner_profile_id = 'cccccccc-8888-0000-0000-0000000000b1' and p.duo_id is null
                  and e.owner_profile_id = 'cccccccc-8888-0000-0000-0000000000b1'
           from public.programs p, public.exercises e
           where p.id = (select program_id from t_res where k = 'b2')
             and e.id = 'cccccccc-8888-0000-0000-000000000e22'),
          '5. programme perso de B, son exercice reste perso');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000c1","role":"authenticated"}';
select is((select count(*)::int from public.program_days
           where id in ((select day_id from t_res where k = 'b1'), (select day_id from t_res where k = 'b2'))),
          1, '5. C voit « Duo un », pas « Perso deux »');
select throws_ok($$ select * from public.save_seance((select day_id from t_res where k = 'b2'), 'Volée',
                   '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:seance_not_found', '5. C ne modifie pas la séance perso de B');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000b1","role":"authenticated"}';
select lives_ok($$
  insert into t_res select 'b1p', * from public.save_seance((select day_id from t_res where k = 'b1'), 'Duo un', '[
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":4,"target_reps_min":6,"target_reps_max":8,"rest_seconds":150},
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e21","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}
  ]'::jsonb, 'perso', 'duo') $$, '5. B garde « Duo un » pour lui (C ne l''a jamais faite)');
select ok((select day_id = (select day_id from t_res where k = 'b1') and not copied
                  and program_id = (select program_id from t_res where k = 'b2')
           from t_res where k = 'b1p'), '5. déplacée (même séance) dans sa bibliothèque perso');
select lives_ok($$
  insert into t_res select 'b1d', * from public.save_seance((select day_id from t_res where k = 'b1'), 'Duo un', '[
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":4,"target_reps_min":6,"target_reps_max":8,"rest_seconds":150},
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e21","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}
  ]'::jsonb, 'duo', 'perso') $$, '5. B la repartage');
select is((select program_id from t_res where k = 'b1d'), (select program_id from t_res where k = 'b1'),
          '5. de retour dans « Nos séances »');
select lives_ok($$
  insert into t_res select 'b1s', * from public.save_seance((select day_id from t_res where k = 'b1'), 'Duo un', '[
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":4,"target_reps_min":6,"target_reps_max":8,"rest_seconds":150},
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e21","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}
  ]'::jsonb, 'duo', 'perso') $$, '5. choix affiché périmé mais déjà du bon côté (C2)');
select is((select program_id from t_res where k = 'b1s'), (select program_id from t_res where k = 'b1'),
          '5. rien ne bouge');
reset role;

-- C a déjà fait « Duo un ».
insert into public.sessions (id, profile_id, program_day_id)
  values ('cccccccc-8888-0000-0000-00000000c5e1', 'cccccccc-8888-0000-0000-0000000000c1',
          (select day_id from t_res where k = 'b1'));

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000b1","role":"authenticated"}';
select lives_ok($$
  insert into t_res select 'b1c', * from public.save_seance((select day_id from t_res where k = 'b1'), 'Duo un', '[
    {"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":5,"target_reps_min":6,"target_reps_max":8,"rest_seconds":150}
  ]'::jsonb, 'perso', 'duo') $$, '5. B garde pour lui une séance que C a faite (C1)');
select ok((select copied and day_id <> (select day_id from t_res where k = 'b1')
                  and program_id = (select program_id from t_res where k = 'b2')
           from t_res where k = 'b1c'), '5. copie perso, renvoyée comme séance écrite');
select is(pg_temp.cm88_exs((select day_id from t_res where k = 'b1c')),
          array['e01:0:5:6:8:150'], '5. les modifications vont à la copie');
select is(pg_temp.cm88_exs((select day_id from t_res where k = 'b1')),
          array['e01:0:4:6:8:150', 'e21:1:3:8:12:90'], '5. l''original du duo est intact');

-- Atomicité : le déplacement fait par set_seance_shared est annulé si la
-- suite échoue (nom déjà pris dans la bibliothèque perso).
select lives_ok($$
  insert into t_res select 'b3', * from public.save_seance(null, 'Duo deux',
    '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e03","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]'::jsonb) $$,
  '5. B crée « Duo deux »');
select throws_ok($$ select * from public.save_seance((select day_id from t_res where k = 'b3'), 'Perso deux',
                   '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e03","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]',
                   'perso', 'duo') $$,
                 'P0001', 'cm88:name_taken', '5. déplacer ET renommer en un nom pris : refus');
select is((select program_id || '#' || name from public.program_days where id = (select day_id from t_res where k = 'b3')),
          (select program_id from t_res where k = 'b1') || '#Duo deux',
          '5. tout ou rien : la séance n''a pas quitté « Nos séances »');
-- Erreur de set_seance_shared (copie au nom déjà pris) : remonte telle quelle.
select throws_ok($$ select * from public.save_seance((select day_id from t_res where k = 'b1'), 'Duo un',
                   '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]',
                   'perso', 'duo') $$,
                 'P0001', 'cm87:name_taken', '5. erreur de set_seance_shared transmise (cm87)');
reset role;

select is((select program_day_id from public.sessions where id = 'cccccccc-8888-0000-0000-00000000c5e1'),
          (select day_id from t_res where k = 'b1'), '5. la séance de C reste rattachée à l''original');

-- ---------------------------------------------------------------------------
-- 6. P, seul dans son duo (invitation en attente) : traité en solo
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000f1","role":"authenticated"}';
select throws_ok($$ select * from public.save_seance(null, 'Seul', '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]', 'duo') $$,
                 'P0001', 'cm88:stale_duo', '6. P : « Pour qui ? » refusé (pas de partenaire)');
select lives_ok($$
  insert into t_res select 'p1', * from public.save_seance(null, 'Seul',
    '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e01","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]'::jsonb) $$,
  '6. P crée une séance');
select ok((select owner_profile_id = 'cccccccc-8888-0000-0000-0000000000f1' and duo_id is null
           from public.programs where id = (select program_id from t_res where k = 'p1')),
          '6. rangée dans sa bibliothèque perso');
reset role;

-- ---------------------------------------------------------------------------
-- 7. Duo : partager une séance perso, exercices du partenaire, actions de C
-- ---------------------------------------------------------------------------

insert into public.exercises (id, name, muscle_group, owner_profile_id) values
  ('cccccccc-8888-0000-0000-000000000e23', 'CM-88 perso B 3', 'other', 'cccccccc-8888-0000-0000-0000000000b1'),
  ('cccccccc-8888-0000-0000-000000000e41', 'CM-88 perso C', 'other', 'cccccccc-8888-0000-0000-0000000000c1');

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000b1","role":"authenticated"}';
select lives_ok($$
  insert into t_res select 'b4', * from public.save_seance(null, 'Perso quatre',
    '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e23","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]'::jsonb,
    'perso') $$, '7. B crée « Perso quatre » pour lui, avec son exercice perso');
select ok((select owner_profile_id = 'cccccccc-8888-0000-0000-0000000000b1' and duo_id is null
           from public.exercises where id = 'cccccccc-8888-0000-0000-000000000e23'),
          '7. son exercice reste perso tant que la séance est perso');
select lives_ok($$
  insert into t_res select 'b4d', * from public.save_seance((select day_id from t_res where k = 'b4'), 'Perso quatre',
    '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e23","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]'::jsonb,
    'duo', 'perso') $$, '7. B la partage avec C');
select ok((select program_id = (select program_id from t_res where k = 'b1') from t_res where k = 'b4d'),
          '7. la séance est dans « Nos séances »');
select ok((select owner_profile_id is null and duo_id = 'cccccccc-8888-0000-0000-0000000000d1'
           from public.exercises where id = 'cccccccc-8888-0000-0000-000000000e23'),
          '7. son exercice perso devient un exercice du duo');
select throws_ok($$ select * from public.save_seance((select day_id from t_res where k = 'b1'), 'Duo un',
                   '[{"exercise_id":"cccccccc-8888-0000-0000-000000000e41","target_sets":3,"target_reps_min":8,"target_reps_max":12,"rest_seconds":90}]') $$,
                 'P0001', 'cm88:exercise_not_in_catalog', '7. exercice perso de C refusé dans une séance de B');
select is(pg_temp.cm88_exs((select day_id from t_res where k = 'b1')),
          array['e01:0:4:6:8:150', 'e21:1:3:8:12:90'], '7. « Duo un » intacte après le refus');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000c1","role":"authenticated"}';
select lives_ok($$ insert into t_res (k, day_id) select 'c1', public.duplicate_seance((select day_id from t_res where k = 'b1')) $$,
                '7. C duplique « Duo un » (séance du duo)');
select is((select program_id from public.program_days where id = (select day_id from t_res where k = 'c1')),
          (select program_id from t_res where k = 'b1'), '7. la copie reste dans « Nos séances »');
select lives_ok($$ select public.move_seance((select day_id from t_res where k = 'c1'), 'up') $$,
                '7. C monte la copie');
select is((select array_agg(name order by order_index) from public.program_days
           where program_id = (select program_id from t_res where k = 'b1')),
          array['Duo un', 'Duo deux', 'Duo un (copie)', 'Perso quatre'], '7. ordre de « Nos séances » réécrit pour les deux');
reset role;

-- ---------------------------------------------------------------------------
-- 8. Suppression (delete_seance)
-- ---------------------------------------------------------------------------

-- C a TERMINÉ « Duo un » avec une série : historique.
insert into public.sessions (id, profile_id, program_day_id, duration_seconds)
  values ('cccccccc-8888-0000-0000-00000000c5e2', 'cccccccc-8888-0000-0000-0000000000c1',
          (select day_id from t_res where k = 'b1'), 1800);
insert into public.session_sets (session_id, exercise_id, set_index, weight_kg, reps)
  values ('cccccccc-8888-0000-0000-00000000c5e2', 'cccccccc-8888-0000-0000-000000000e01', 1, 40, 8);

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok($$ select public.delete_seance((select day_id from t_res where k = 'b1')) $$,
                 'P0001', 'cm88:seance_has_history', '8. B : refus, C a déjà fait cette séance');
select is((select count(*)::int from public.program_days where id = (select day_id from t_res where k = 'b1')),
          1, '8. rien de supprimé');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000e1","role":"authenticated"}';
select throws_ok($$ select public.delete_seance((select day_id from t_res where k = 'c1')) $$,
                 'P0001', 'cm88:seance_not_found', '8. X : suppression d''une séance du duo refusée');
reset role;
select is((select count(*)::int from public.program_days where id = (select day_id from t_res where k = 'c1')),
          1, '8. la copie de C est toujours là');

set local role authenticated;
set local request.jwt.claims = '{"sub":"cccccccc-8888-0000-0000-0000000000b1","role":"authenticated"}';
select lives_ok($$ select public.delete_seance((select day_id from t_res where k = 'c1')) $$,
                '8. B supprime la copie faite par C (aucun historique)');
select is((select count(*)::int from public.program_days where id = (select day_id from t_res where k = 'c1')),
          0, '8. supprimée');
-- La séance de C en cours (cas 5, sans série ni fin) ne bloque pas : copie
-- perso de B (« Duo un » du cas 5) supprimable.
select lives_ok($$ select public.delete_seance((select day_id from t_res where k = 'b1c')) $$,
                '8. B supprime sa copie perso (jamais faite)');
reset role;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.delete_seance('cccccccc-8888-0000-0000-000000000000') $$, '42501', null,
                 '8. anon : delete_seance refusé');
reset role;

select * from finish();

rollback;
