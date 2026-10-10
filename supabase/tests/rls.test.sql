-- CM-59 livraison A : tests RLS (pgTAP), lancés par `supabase test db`
-- (job e2e de la CI, juste après `supabase db reset`).
--
-- Comptes du seed (supabase/seed.sql) :
--   Toi  11111111-1111-1111-1111-111111111111  membre du duo 3333…
--   Elle 22222222-2222-2222-2222-222222222222  membre du duo 3333…
--   Solo 44444444-4444-4444-4444-444444444444  hors duo
-- Chaque cas se joue sous un rôle client (`anon` ou `authenticated`, avec le
-- jeton simulé par request.jwt.claims) ; `reset role` entre les cas.
-- Tout tourne dans une transaction annulée : la base seedée reste intacte
-- pour les e2e.

begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

-- Données propres aux tests (en postgres, avant tout changement de rôle) ------
-- Une séance d'Elle (le seed n'en a pas) et un exercice propre au duo.
insert into public.sessions (id, profile_id, program_day_id, performed_at, notes, duration_seconds) values
  ('aaaaaaaa-5959-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222',
   '55555555-5555-5555-5555-000000000002', '2026-10-03 18:00:00+02', 'Séance d''Elle (test)', 3000);

insert into public.exercises (id, name, muscle_group, is_compound, duo_id) values
  ('aaaaaaaa-5959-0000-0000-000000000002', 'Exercice du duo (test)', 'other', false,
   '33333333-3333-3333-3333-333333333333');

-- ---------------------------------------------------------------------------
-- 1. anon ne lit aucune table publique.
-- ---------------------------------------------------------------------------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

select throws_ok($$ select * from public.profiles $$,          '42501', null, '1. anon : profiles refusé');
select throws_ok($$ select * from public.duos $$,              '42501', null, '1. anon : duos refusé');
select throws_ok($$ select * from public.duo_members $$,       '42501', null, '1. anon : duo_members refusé');
select throws_ok($$ select * from public.duo_invitations $$,   '42501', null, '1. anon : duo_invitations refusé');
select throws_ok($$ select * from public.exercises $$,         '42501', null, '1. anon : exercises refusé');
select throws_ok($$ select * from public.programs $$,          '42501', null, '1. anon : programs refusé');
select throws_ok($$ select * from public.program_days $$,      '42501', null, '1. anon : program_days refusé');
select throws_ok($$ select * from public.program_exercises $$, '42501', null, '1. anon : program_exercises refusé');
select throws_ok($$ select * from public.sessions $$,          '42501', null, '1. anon : sessions refusé');
select throws_ok($$ select * from public.session_sets $$,      '42501', null, '1. anon : session_sets refusé');

reset role;

-- ---------------------------------------------------------------------------
-- 2. Toi voit ses séances et celles d'Elle, aucune de Solo.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is((select count(*)::int from public.sessions where profile_id = '11111111-1111-1111-1111-111111111111'),
          1, '2. Toi voit sa séance');
select is((select count(*)::int from public.sessions where profile_id = '22222222-2222-2222-2222-222222222222'),
          1, '2. Toi voit la séance d''Elle');
select is((select count(*)::int from public.sessions where profile_id = '44444444-4444-4444-4444-444444444444'),
          0, '2. Toi ne voit aucune séance de Solo');

reset role;

-- ---------------------------------------------------------------------------
-- 3. Solo ne voit rien du duo.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is((select count(*)::int from public.sessions where profile_id <> '44444444-4444-4444-4444-444444444444'),
          0, '3. Solo : aucune séance du duo');
select is((select count(*)::int from public.session_sets where session_id <> '99999999-9999-9999-9999-000000000004'),
          0, '3. Solo : aucune série du duo');
select is((select count(*)::int from public.programs where id <> '99999999-9999-9999-9999-000000000001'),
          0, '3. Solo : aucun programme du duo');
select is((select count(*)::int from public.program_days where program_id <> '99999999-9999-9999-9999-000000000001'),
          0, '3. Solo : aucune séance type du duo');
select is((select count(*)::int from public.exercises where duo_id is not null),
          0, '3. Solo : aucun exercice du duo');

-- ---------------------------------------------------------------------------
-- 4. Solo voit le catalogue système.
-- ---------------------------------------------------------------------------
select ok((select count(*) from public.exercises where duo_id is null) > 0,
          '4. Solo voit les exercices système');

-- ---------------------------------------------------------------------------
-- 5 à 8. Solo ne peut pas écrire chez le duo.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.sessions (profile_id, notes)
     values ('11111111-1111-1111-1111-111111111111', 'usurpation') $$,
  '42501', null, '5. Solo ne crée pas de séance au nom de Toi');

select throws_ok(
  $$ insert into public.session_sets (session_id, exercise_id, set_index, weight_kg, reps)
     values ('77777777-7777-7777-7777-000000000001', '5c691ede-719c-4f3a-b714-34f91005f3dd', 9, 10, 5) $$,
  '42501', null, '6. Solo n''ajoute pas de série dans une séance de Toi');

select throws_ok(
  $$ insert into public.program_days (program_id, name)
     values ('44444444-4444-4444-4444-444444444444', 'Intrusion') $$,
  '42501', null, '7. Solo n''ajoute pas de séance type au programme du duo');

select throws_ok(
  $$ insert into public.sessions (program_day_id, notes)
     values ('55555555-5555-5555-5555-000000000001', 'séance type du duo') $$,
  '42501', null, '8. Solo ne démarre pas de séance sur une séance type du duo');

reset role;

-- ---------------------------------------------------------------------------
-- 9. Elle ne modifie ni ne supprime une séance de Toi (0 ligne touchée).
-- 10. Elle lit les séries d'une séance de Toi.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ update public.sessions set notes = 'modifié par Elle'
     where id = '77777777-7777-7777-7777-000000000001' $$,
  '9. Elle : update d''une séance de Toi sans erreur');
select lives_ok(
  $$ delete from public.sessions where id = '77777777-7777-7777-7777-000000000001' $$,
  '9. Elle : delete d''une séance de Toi sans erreur');
-- Elle voit encore la séance (lecture duo) : elle n'a été ni modifiée ni supprimée.
select is((select notes from public.sessions where id = '77777777-7777-7777-7777-000000000001'),
          'Séance de test (seed)', '9. séance de Toi non modifiée (0 ligne)');
select ok(exists (select 1 from public.sessions where id = '77777777-7777-7777-7777-000000000001'),
          '9. séance de Toi non supprimée (0 ligne)');

select is((select count(*)::int from public.session_sets
           where session_id = '77777777-7777-7777-7777-000000000001'),
          7, '10. Elle lit les séries d''une séance de Toi');

reset role;

-- ---------------------------------------------------------------------------
-- 11. Programmes du duo : création OK ; owner_profile_id ET duo_id refusé.
-- 12. Exercice rattaché à un autre duo refusé.
-- 13. Profils : id non modifiable, profil d'Elle intouchable, le sien OK.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.programs (id, name, duo_id)
     values ('aaaaaaaa-5959-0000-0000-000000000011', 'Programme duo (test)',
             '33333333-3333-3333-3333-333333333333') $$,
  '11. Toi crée un programme du duo');
select is((select duo_id from public.programs where id = 'aaaaaaaa-5959-0000-0000-000000000011'),
          '33333333-3333-3333-3333-333333333333'::uuid, '11. programme du duo visible par Toi');
select throws_ok(
  $$ insert into public.programs (name, owner_profile_id, duo_id)
     values ('Hybride', '11111111-1111-1111-1111-111111111111',
             '33333333-3333-3333-3333-333333333333') $$,
  '42501', null, '11. owner_profile_id ET duo_id refusé');

select throws_ok(
  $$ insert into public.exercises (name, muscle_group, duo_id)
     values ('Exercice d''un autre duo', 'other', 'bbbbbbbb-5959-0000-0000-000000000001') $$,
  '42501', null, '12. Toi ne crée pas d''exercice pour un autre duo');

select throws_ok(
  $$ update public.profiles set id = id where id = '11111111-1111-1111-1111-111111111111' $$,
  '42501', null, '13. profiles.id non modifiable');
select lives_ok(
  $$ update public.profiles set display_name = 'Piraté'
     where id = '22222222-2222-2222-2222-222222222222' $$,
  '13. update du profil d''Elle sans erreur');
select is((select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
          'Elle', '13. profil d''Elle inchangé (0 ligne)');
select lives_ok(
  $$ update public.profiles set display_name = 'Toi bis', weekly_goal = 5
     where id = '11111111-1111-1111-1111-111111111111' $$,
  '13. Toi met à jour son propre profil (colonnes autorisées)');
select is((select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
          'Toi bis', '13. profil de Toi mis à jour');

reset role;

-- ---------------------------------------------------------------------------
-- 14. Solo : duo_members vide, duo_invitations interdit.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is((select count(*)::int from public.duo_members), 0, '14. Solo : 0 ligne dans duo_members');
select throws_ok($$ select * from public.duo_invitations $$, '42501', null,
                 '14. Solo : duo_invitations refusé');

-- ---------------------------------------------------------------------------
-- 15. TRUNCATE interdit à authenticated.
-- ---------------------------------------------------------------------------
select throws_ok($$ truncate public.sessions $$, '42501', null, '15. truncate sessions refusé');

reset role;

-- ---------------------------------------------------------------------------
-- 16. Séance sans profile_id : profil = utilisateur connecté (default).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.sessions (notes) values ('cm59-cas-16') $$,
  '16. Toi crée une séance sans profile_id');
select is((select profile_id from public.sessions where notes = 'cm59-cas-16'),
          '11111111-1111-1111-1111-111111111111'::uuid, '16. profile_id = Toi');

reset role;

-- ---------------------------------------------------------------------------
-- 17. Création d'un compte Auth (postgres / serveur) : profil créé par le
--     trigger on_auth_user_created malgré les EXECUTE retirés.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-5959-0000-0000-000000000017',
             'authenticated', 'authenticated', 'cas17@coach-en-muscu.test',
             '{"display_name":"Cas 17"}') $$,
  '17. création d''un compte Auth');
select is((select display_name from public.profiles where id = 'aaaaaaaa-5959-0000-0000-000000000017'),
          'Cas 17', '17. profil créé par le trigger');

select * from finish();

rollback;
