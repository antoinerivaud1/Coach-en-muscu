-- CM-87 : duo optionnel (invitation, rejoindre, quitter, partager une
-- séance). Lancé par `supabase test db` (job e2e de la CI, après
-- `supabase db reset`).
--
-- Comptes du seed (supabase/seed.sql) :
--   Toi  11111111-…  membre du duo 3333… (avec Elle)
--   Elle 22222222-…  membre du duo 3333…
--   Solo 44444444-…  hors duo, programme perso (« Full body »), orange
--   Duo2 55555555-…  hors duo, sans données, orange (conflit de couleur)
-- Comptes créés ici : Tiers A (aaaaaaaa-8787-0000-0000-0000000000a1) et
-- Tiers B (…-0000000000b1), hors duo.
-- RLS jouée sous `authenticated` (jeton simulé par request.jwt.claims),
-- `reset role` entre les cas. Transaction annulée : la base seedée reste
-- intacte pour les e2e.

begin;

create extension if not exists pgtap with schema extensions;

select plan(96);

-- ---------------------------------------------------------------------------
-- Données de test (postgres)
-- ---------------------------------------------------------------------------

-- L'exercice perso de Solo (seed) entre dans sa séance type « Full body ».
insert into public.program_exercises (program_day_id, exercise_id, order_index, target_sets)
  values ('99999999-9999-9999-9999-000000000002', '99999999-9999-9999-9999-000000000006', 1, 3);

-- Bibliothèque perso de Duo2 : séance type « Gainage » avec un exercice perso.
insert into public.exercises (id, name, muscle_group, owner_profile_id) values
  ('aaaaaaaa-8787-0000-0000-000000000e01', 'Planche (Duo2)', 'other',
   '55555555-5555-5555-5555-555555555555');
insert into public.programs (id, name, owner_profile_id) values
  ('aaaaaaaa-8787-0000-0000-000000000f01', 'Mes séances', '55555555-5555-5555-5555-555555555555');
insert into public.program_days (id, program_id, name, order_index) values
  ('aaaaaaaa-8787-0000-0000-000000000d01', 'aaaaaaaa-8787-0000-0000-000000000f01', 'Gainage', 0),
  -- Même nom qu'une séance de Solo : sert au refus « nom déjà pris ».
  ('aaaaaaaa-8787-0000-0000-000000000d02', 'aaaaaaaa-8787-0000-0000-000000000f01', 'Full body', 1);
insert into public.program_exercises (program_day_id, exercise_id, order_index, target_sets) values
  ('aaaaaaaa-8787-0000-0000-000000000d01', 'aaaaaaaa-8787-0000-0000-000000000e01', 0, 3);

-- Deux comptes tiers, hors duo (profils créés par le trigger).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-8787-0000-0000-0000000000a1',
   'authenticated', 'authenticated', 'tiers-a@coach-en-muscu.test', '{"display_name":"Tiers A"}'),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-8787-0000-0000-0000000000b1',
   'authenticated', 'authenticated', 'tiers-b@coach-en-muscu.test', '{"display_name":"Tiers B"}');

-- Codes lus pendant les cas.
create temp table t_codes (k text primary key, code text, expires_at timestamptz);
grant all on t_codes to authenticated;

-- Témoins du duo Toi / Elle.
create temp table t_ref as
  select (select count(*) from public.duo_members
          where duo_id = '33333333-3333-3333-3333-333333333333') as members,
         (select count(*) from public.program_days
          where program_id = '44444444-4444-4444-4444-444444444444') as days,
         (select count(*) from public.session_sets) as all_sets,
         (select count(*) from public.sessions) as all_sessions;

-- ---------------------------------------------------------------------------
-- 1. Structure et droits
-- ---------------------------------------------------------------------------

select is((select count(*)::int from pg_policies where schemaname = 'public'),
          22, '1. toujours 22 policies dans public (aucune écriture directe sur duo_*)');
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('create_duo_invitation', 'get_my_duo_invitation',
                               'revoke_duo_invitation', 'get_duo_invitation',
                               'accept_duo_invitation', 'leave_duo', 'set_seance_shared')),
          '1. RPC : security definer, search_path vide');
select ok(has_function_privilege('authenticated', 'public.create_duo_invitation()', 'execute')
          and has_function_privilege('authenticated', 'public.accept_duo_invitation(text, text)', 'execute')
          and has_function_privilege('authenticated', 'public.leave_duo()', 'execute')
          and has_function_privilege('authenticated', 'public.set_seance_shared(uuid, boolean)', 'execute'),
          '1. authenticated exécute les RPC');
select ok(not has_function_privilege('anon', 'public.create_duo_invitation()', 'execute')
          and not has_function_privilege('anon', 'public.get_duo_invitation(text)', 'execute')
          and not has_function_privilege('anon', 'public.accept_duo_invitation(text, text)', 'execute')
          and not has_function_privilege('anon', 'public.leave_duo()', 'execute'),
          '1. anon n''exécute aucune RPC');
select ok(not has_function_privilege('authenticated', 'public.cm87_copy_duo_library(uuid, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.cm87_dissolve_solo_duo(uuid, uuid)', 'execute')
          and not has_function_privilege('authenticated', 'public.cm87_move_day(uuid, uuid, boolean)', 'execute')
          and not has_function_privilege('authenticated', 'public.cm87_valid_invitation(text, uuid, boolean)', 'execute'),
          '1. fonctions internes cm87_ : aucun droit client');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from public.create_duo_invitation() $$, '42501', null,
                 '1. anon : create_duo_invitation refusé');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Solo invite : duo créé (1 membre), code au bon format, 7 jours.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select lives_ok(
  $$ insert into t_codes select 'solo1', code, expires_at from public.create_duo_invitation() $$,
  '2. Solo crée une invitation');
select matches((select code from t_codes where k = 'solo1'), '^[A-HJ-NP-Z2-9]{6}$',
               '2. code de 6 caractères sans 0, O, 1 ni I');
select ok((select expires_at between now() + interval '6 days 23 hours' and now() + interval '7 days 1 minute'
           from t_codes where k = 'solo1'), '2. valable 7 jours');
select is((select count(*)::int from public.duo_members), 1, '2. Solo est seul dans son nouveau duo');
select is((select code from public.get_my_duo_invitation()),
          (select code from t_codes where k = 'solo1'), '2. invitation en attente relue');
select throws_ok($$ select * from public.duo_invitations $$, '42501', null,
                 '2. duo_invitations toujours illisible en direct');
select throws_ok(
  $$ insert into public.duo_members (duo_id, profile_id)
     values ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444') $$,
  '42501', null, '2. aucune écriture directe dans duo_members');

-- Une seule invitation active : la seconde révoque la première.
select lives_ok(
  $$ insert into t_codes select 'solo2', code, expires_at from public.create_duo_invitation() $$,
  '2. Solo recrée une invitation');
select is((select code from public.get_my_duo_invitation()),
          (select code from t_codes where k = 'solo2'), '2. seule la dernière est active');
select is((select count(*)::int from public.duo_members), 1, '2. toujours un seul duo pour Solo');

select throws_ok(
  $$ select * from public.get_duo_invitation((select code from t_codes where k = 'solo2')) $$,
  'P0001', 'cm87:invitation_self', '2. Solo ne peut pas accepter sa propre invitation');

reset role;

-- La toute première invitation est bien révoquée en base.
select ok((select revoked_at is not null from public.duo_invitations
           where code = (select code from t_codes where k = 'solo1')
           order by created_at limit 1),
          '2. première invitation révoquée');

-- ---------------------------------------------------------------------------
-- 3. Duo2 consulte puis accepte (conflit de couleur).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select throws_ok(
  $$ select * from public.get_duo_invitation((select code from t_codes where k = 'solo1')) $$,
  'P0001', 'cm87:invitation_invalid', '3. code révoqué refusé');
select throws_ok($$ select * from public.get_duo_invitation('ABC') $$,
  'P0001', 'cm87:invitation_invalid', '3. code mal formé refusé');

select results_eq(
  $$ select inviter_name, inviter_color, my_color, color_conflict, already_in_duo
     from public.get_duo_invitation(lower((select code from t_codes where k = 'solo2'))) $$,
  $$ values ('Solo'::text, '#FF8A3D'::text, '#FF8A3D'::text, true, false) $$,
  '3. aperçu : prénom et couleur de Solo, conflit signalé (code en minuscules accepté)');

select throws_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'solo2')) $$,
  'P0001', 'cm87:color_conflict', '3. même couleur que Solo : refus sans nouvelle couleur');
select throws_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'solo2'), '#000000') $$,
  'P0001', 'cm87:color_invalid', '3. couleur hors palette refusée');
select is((select count(*)::int from public.duo_members), 0, '3. refus : Duo2 toujours hors duo');

select lives_ok(
  $$ insert into t_codes (k, code)
     select 'duo_id', public.accept_duo_invitation(
       (select code from t_codes where k = 'solo2'), '#5B8CFF')::text $$,
  '3. Duo2 accepte avec le bleu');
select is((select accent_color from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
          '#5B8CFF', '3. couleur de Duo2 mise à jour');
select is((select count(*)::int from public.duo_members), 2, '3. duo de Solo et Duo2 : 2 membres');

-- ---------------------------------------------------------------------------
-- 4. Bibliothèques : celle de Solo devient celle du duo, celle de Duo2 reste
--    à Duo2.
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.program_days d
           join public.programs p on p.id = d.program_id
           where p.duo_id is not null and d.name = 'Full body'),
          1, '4. Duo2 voit « Full body » de Solo dans les séances du duo');
select is((select count(*)::int from public.exercises
           where id = '99999999-9999-9999-9999-000000000006' and duo_id is not null),
          1, '4. l''exercice perso utilisé par « Full body » devient exercice du duo');
select is((select count(*)::int from public.program_days
           where id = 'aaaaaaaa-8787-0000-0000-000000000d01'
             and program_id = 'aaaaaaaa-8787-0000-0000-000000000f01'),
          1, '4. « Gainage » de Duo2 reste dans sa bibliothèque perso');
select is((select count(*)::int from public.sessions
           where profile_id = '44444444-4444-4444-4444-444444444444'),
          1, '4. Duo2 voit la séance réalisée de Solo');
select is((select count(*)::int from public.programs
           where duo_id = '33333333-3333-3333-3333-333333333333'),
          0, '4. Duo2 ne voit rien du duo Toi / Elle');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is((select count(*)::int from public.program_days
           where id = 'aaaaaaaa-8787-0000-0000-000000000d01'),
          0, '4. Solo ne voit pas la séance perso de Duo2');
select is((select count(*)::int from public.exercises
           where id = 'aaaaaaaa-8787-0000-0000-000000000e01'),
          0, '4. Solo ne voit pas l''exercice perso de Duo2');
select is((select count(*)::int from public.program_days d
           join public.programs p on p.id = d.program_id
           where p.duo_id is not null), 1, '4. Solo voit la séance du duo');
select is((select count(*)::int from public.get_my_duo_invitation()), 0,
          '4. plus d''invitation en attente');

-- Duo plein : Solo ne peut plus inviter.
select throws_ok($$ select * from public.create_duo_invitation() $$,
  'P0001', 'cm87:duo_full', '4. duo plein : Solo n''invite pas un 3e');

-- Solo démarre une séance sur « Full body » (séance du duo) et y logge une
-- série avec l'exercice passé au duo : servira au départ (cas 7).
select lives_ok(
  $$ insert into public.sessions (id, program_day_id, duration_seconds, notes)
     values ('aaaaaaaa-8787-0000-0000-000000000501', '99999999-9999-9999-9999-000000000002',
             1200, 'cm87 séance du duo') $$,
  '4. Solo démarre une séance sur une séance du duo');
select lives_ok(
  $$ insert into public.session_sets (session_id, exercise_id, set_index, weight_kg, reps)
     values ('aaaaaaaa-8787-0000-0000-000000000501', '99999999-9999-9999-9999-000000000006', 1, 20, 10) $$,
  '4. Solo logge une série avec l''exercice du duo');

reset role;

-- ---------------------------------------------------------------------------
-- 5. Codes réutilisé, expiré, révoqué ; membre d'un duo plein.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'solo2')) $$,
  'P0001', 'cm87:invitation_invalid', '5. code déjà accepté refusé');
select throws_ok($$ select * from public.create_duo_invitation() $$,
  'P0001', 'cm87:duo_full', '5. Toi (duo plein) n''invite pas un 3e');

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8787-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$ insert into t_codes select 'tiersA', code, expires_at from public.create_duo_invitation() $$,
  '5. Tiers A invite');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'tiersA')) $$,
  'P0001', 'cm87:already_in_duo', '5. Toi, déjà en duo, ne rejoint pas Tiers A');
select results_eq(
  $$ select already_in_duo from public.get_duo_invitation((select code from t_codes where k = 'tiersA')) $$,
  $$ values (true) $$, '5. aperçu : « déjà en duo » signalé');
reset role;

-- Expiration simulée (postgres).
update public.duo_invitations set expires_at = now() - interval '1 minute'
  where code = (select code from t_codes where k = 'tiersA');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8787-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'tiersA')) $$,
  'P0001', 'cm87:invitation_expired', '5. code expiré refusé');
reset role;

-- Nouvelle invitation de Tiers A, puis annulation : le duo à un membre est
-- dissous.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8787-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$ insert into t_codes select 'tiersA2', code, expires_at from public.create_duo_invitation() $$,
  '5. Tiers A réinvite');
select lives_ok($$ select public.revoke_duo_invitation() $$, '5. Tiers A annule');
select is((select count(*)::int from public.duo_members), 0, '5. Tiers A redevient solo (duo dissous)');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-8787-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'tiersA2')) $$,
  'P0001', 'cm87:invitation_invalid', '5. code annulé refusé');
select throws_ok($$ select public.leave_duo() $$,
  'P0001', 'cm87:not_in_duo', '5. Tiers B ne quitte pas un duo qu''il n''a pas');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Partager / garder pour moi.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select lives_ok(
  $$ select public.set_seance_shared('aaaaaaaa-8787-0000-0000-000000000d01', true) $$,
  '6. Duo2 partage « Gainage »');
select is((select count(*)::int from public.exercises
           where id = 'aaaaaaaa-8787-0000-0000-000000000e01' and duo_id is not null and owner_profile_id is null),
          1, '6. son exercice perso devient exercice du duo');
select throws_ok(
  $$ select public.set_seance_shared('aaaaaaaa-8787-0000-0000-000000000d02', true) $$,
  'P0001', 'cm87:name_taken', '6. « Full body » existe déjà dans le duo : refus');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select is((select count(*)::int from public.program_days
           where id = 'aaaaaaaa-8787-0000-0000-000000000d01'),
          1, '6. Solo voit maintenant « Gainage »');
select is((select count(*)::int from public.exercises
           where id = 'aaaaaaaa-8787-0000-0000-000000000e01'),
          1, '6. et son exercice');
select lives_ok(
  $$ select public.set_seance_shared('aaaaaaaa-8787-0000-0000-000000000d01', false) $$,
  '6. Solo garde « Gainage » pour lui');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select is((select count(*)::int from public.program_days
           where id = 'aaaaaaaa-8787-0000-0000-000000000d01'),
          0, '6. Duo2 ne voit plus « Gainage »');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select lives_ok(
  $$ select public.set_seance_shared('aaaaaaaa-8787-0000-0000-000000000d01', true) $$,
  '6. Solo la repartage');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.set_seance_shared('aaaaaaaa-8787-0000-0000-000000000d01', false) $$,
  'P0001', 'cm87:seance_not_found', '6. Toi ne touche pas une séance d''un autre duo');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok(
  $$ select public.set_seance_shared('55555555-5555-5555-5555-000000000001', false) $$,
  'P0001', 'cm87:seance_not_found', '6. Solo ne touche pas « Haut du corps » du duo Toi / Elle');
reset role;

select is((select program_id from public.program_days where id = '55555555-5555-5555-5555-000000000001'),
          '44444444-4444-4444-4444-444444444444'::uuid, '6. « Haut du corps » du duo Toi / Elle inchangé');

-- Toi garde « Haut du corps » pour lui puis le repartage (aller-retour).
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.set_seance_shared('55555555-5555-5555-5555-000000000001', false) $$,
  '6. Toi garde « Haut du corps » pour lui');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.program_days where id = '55555555-5555-5555-5555-000000000001'),
          0, '6. Elle ne la voit plus');
select is((select count(*)::int from public.sessions where id = '77777777-7777-7777-7777-000000000001'),
          1, '6. Elle voit toujours la séance réalisée de Toi');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.set_seance_shared('55555555-5555-5555-5555-000000000001', true) $$,
  '6. Toi la repartage');
reset role;
select is((select program_id from public.program_days where id = '55555555-5555-5555-5555-000000000001'),
          '44444444-4444-4444-4444-444444444444'::uuid, '6. retour dans « Nos séances » du duo Toi / Elle');

-- ---------------------------------------------------------------------------
-- 6 bis. (C1) « Garder pour moi » sur une séance du duo qu'Elle est EN TRAIN
--        de faire : copie perso pour Toi, l'original reste au duo, Elle
--        garde sa séance lisible et terminable.
-- ---------------------------------------------------------------------------
insert into public.sessions (id, profile_id, program_day_id, performed_at, notes) values
  ('aaaaaaaa-8787-0000-0000-000000000601', '22222222-2222-2222-2222-222222222222',
   '55555555-5555-5555-5555-000000000002', now() - interval '20 minutes', 'cm87 séance en cours d''Elle');
insert into public.session_sets (session_id, exercise_id, set_index, weight_kg, reps) values
  ('aaaaaaaa-8787-0000-0000-000000000601', '1e56eade-5cd1-4ea0-9742-9ac31b8c37ed', 1, 50, 8);

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select results_eq(
  $$ select status from public.set_seance_shared('55555555-5555-5555-5555-000000000002', false) $$,
  $$ values ('copied'::text) $$,
  '6b. Elle a une séance dessus : copie perso pour Toi, pas de déplacement');
select is((select count(*)::int from public.program_days d
           join public.programs p on p.id = d.program_id
           where p.owner_profile_id = '11111111-1111-1111-1111-111111111111'
             and d.name = 'Bas du corps'
             and (select count(*) from public.program_exercises pe where pe.program_day_id = d.id) = 4),
          1, '6b. Toi a « Bas du corps » (4 exercices) dans « Mes séances »');
reset role;

select is((select program_id from public.program_days where id = '55555555-5555-5555-5555-000000000002'),
          '44444444-4444-4444-4444-444444444444'::uuid, '6b. l''original reste dans « Nos séances »');

set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select d.name from public.sessions s join public.program_days d on d.id = s.program_day_id
           where s.id = 'aaaaaaaa-8787-0000-0000-000000000601'),
          'Bas du corps', '6b. Elle lit toujours sa séance en cours (nom compris)');
select lives_ok(
  $$ insert into public.session_sets (session_id, exercise_id, set_index, weight_kg, reps)
     values ('aaaaaaaa-8787-0000-0000-000000000601', '1e56eade-5cd1-4ea0-9742-9ac31b8c37ed', 2, 52.5, 8) $$,
  '6b. Elle ajoute une série');
select lives_ok(
  $$ update public.sessions set duration_seconds = 1500
     where id = 'aaaaaaaa-8787-0000-0000-000000000601' $$,
  '6b. Elle termine sa séance');
reset role;
select is((select duration_seconds from public.sessions where id = 'aaaaaaaa-8787-0000-0000-000000000601'),
          1500, '6b. séance d''Elle bien terminée');

-- ---------------------------------------------------------------------------
-- 7. Solo quitte le duo.
-- ---------------------------------------------------------------------------
create temp table t_before as
  select (select count(*) from public.sessions
          where profile_id = '44444444-4444-4444-4444-444444444444') as solo_sessions,
         (select count(*) from public.session_sets ss join public.sessions s on s.id = ss.session_id
          where s.profile_id = '44444444-4444-4444-4444-444444444444') as solo_sets,
         (select count(*) from public.program_days d join public.programs p on p.id = d.program_id
          where p.duo_id = (select code::uuid from t_codes where k = 'duo_id')) as duo_days;

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select lives_ok($$ select public.leave_duo() $$, '7. Solo quitte le duo');
select is((select count(*)::int from public.duo_members), 0, '7. Solo n''est plus dans aucun duo');
select is((select count(*)::int from public.sessions
           where profile_id = '55555555-5555-5555-5555-555555555555'), 0,
          '7. plus de visibilité croisée (Solo ne voit plus Duo2)');
select is((select count(*)::int from public.program_days d
           join public.programs p on p.id = d.program_id
           where p.owner_profile_id = '44444444-4444-4444-4444-444444444444'
             and d.name in ('Full body', 'Gainage')),
          2, '7. Solo a une copie perso des 2 séances du duo');
select is((select count(*)::int from public.program_days d
           join public.programs p on p.id = d.program_id where p.duo_id is not null),
          0, '7. Solo ne voit plus aucune séance de duo');
select ok((select bool_and(e.owner_profile_id = '44444444-4444-4444-4444-444444444444')
           from public.program_exercises pe
           join public.program_days d on d.id = pe.program_day_id
           join public.programs p on p.id = d.program_id
           join public.exercises e on e.id = pe.exercise_id
           where p.owner_profile_id = '44444444-4444-4444-4444-444444444444'
             and (e.duo_id is not null or e.owner_profile_id is not null)),
          '7. les copies utilisent des copies perso des exercices du duo');
select is((select count(*)::int from public.session_sets ss
           join public.exercises e on e.id = ss.exercise_id
           where ss.session_id = 'aaaaaaaa-8787-0000-0000-000000000501'
             and e.owner_profile_id = '44444444-4444-4444-4444-444444444444'),
          1, '7. sa série pointe vers sa copie de l''exercice (nom toujours lisible)');
select is((select d.name from public.sessions s join public.program_days d on d.id = s.program_day_id
           where s.id = 'aaaaaaaa-8787-0000-0000-000000000501'),
          'Full body', '7. sa séance réalisée reste rattachée (à sa copie)');
reset role;

select is((select count(*) from public.sessions where profile_id = '44444444-4444-4444-4444-444444444444'),
          (select solo_sessions from t_before), '7. toutes les séances de Solo conservées');
select is((select count(*) from public.session_sets ss join public.sessions s on s.id = ss.session_id
           where s.profile_id = '44444444-4444-4444-4444-444444444444'),
          (select solo_sets from t_before), '7. toutes ses séries conservées');
select is((select count(*)::int from public.duos where id = (select code::uuid from t_codes where k = 'duo_id')),
          0, '7. Duo2 reste seul : le duo est dissous');

set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select is((select count(*)::int from public.program_days d
           join public.programs p on p.id = d.program_id
           where p.owner_profile_id = '55555555-5555-5555-5555-555555555555'
             and d.name in ('Full body', 'Gainage')),
          2, '7. Duo2 garde la bibliothèque (devenue la sienne)');
select is((select count(*)::int from public.sessions
           where profile_id = '44444444-4444-4444-4444-444444444444'), 0,
          '7. Duo2 ne voit plus les séances de Solo');
select is((select count(*)::int from public.exercises
           where id = '99999999-9999-9999-9999-000000000006'
             and owner_profile_id = '55555555-5555-5555-5555-555555555555'),
          1, '7. Duo2 garde les exercices de l''ancien duo, à son nom');
select throws_ok($$ select public.leave_duo() $$,
  'P0001', 'cm87:not_in_duo', '7. Duo2 n''a plus de duo à quitter');
reset role;

-- Revenir : nouvelle invitation obligatoire.
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select lives_ok(
  $$ insert into t_codes select 'solo3', code, expires_at from public.create_duo_invitation() $$,
  '7. Solo réinvite');
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';
select lives_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'solo3')) $$,
  '7. Duo2 revient avec la nouvelle invitation (couleurs déjà différentes)');
select is((select count(*)::int from public.duo_members), 2, '7. de nouveau en duo');
reset role;

select is((select count(*) from public.sessions), (select all_sessions from t_ref) + 2,
          '7. aucune séance perdue dans toute la base (+1 au cas 4, +1 au cas 6 bis)');
select is((select count(*) from public.session_sets), (select all_sets from t_ref) + 3,
          '7. aucune série perdue dans toute la base (+1 au cas 4, +2 au cas 6 bis)');

-- ---------------------------------------------------------------------------
-- 8. Toi et Elle ne sont pas affectés.
-- ---------------------------------------------------------------------------
select is((select count(*) from public.duo_members where duo_id = '33333333-3333-3333-3333-333333333333'),
          (select members from t_ref), '8. duo Toi / Elle : 2 membres');
select is((select count(*) from public.program_days where program_id = '44444444-4444-4444-4444-444444444444'),
          (select days from t_ref), '8. « Nos séances » : mêmes séances types (la copie du cas 6 bis est perso)');
select is((select accent_color from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
          '#FF4F7E', '8. couleur d''Elle inchangée');

select * from finish();

rollback;
