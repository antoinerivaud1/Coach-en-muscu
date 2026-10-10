-- CM-60 : suppression du compte (RPC delete_my_account). Lancé par
-- `supabase test db` (job e2e de la CI, après `supabase db reset`).
--
-- Comptes du seed (supabase/seed.sql) :
--   Toi  11111111-…  membre du duo 3333… (avec Elle)
--   Elle 22222222-…  membre du duo 3333…
--   Solo 44444444-…  hors duo, programme perso (« Full body »)
--   Duo2 55555555-…  hors duo, sans données
-- Données ajoutées ici (ids cccccccc-6060-…), voir « Données de test ».
--
-- Méthode : instantané JSON de TOUTES les lignes des tables concernées
-- (auth.users, auth.identities et les 10 tables de public) avant et après
-- chaque suppression. Les lignes disparues et les lignes nouvelles ou
-- modifiées sont comptées table par table et comparées à l'attendu exact :
-- « rien d'autre ne bouge » est vérifié ligne à ligne.
--
-- RLS jouée sous `authenticated` (jeton simulé par request.jwt.claims),
-- `reset role` entre les cas. Transaction annulée : la base seedée reste
-- intacte pour les e2e.

begin;

create extension if not exists pgtap with schema extensions;

select plan(48);

-- ---------------------------------------------------------------------------
-- Outils (postgres)
-- ---------------------------------------------------------------------------

create function pg_temp.cm60_rows()
 returns table (t text, j jsonb)
 language sql
as $$
  select 'auth.users', to_jsonb(x) from auth.users x
  union all select 'auth.identities', to_jsonb(x) from auth.identities x
  union all select 'profiles', to_jsonb(x) from public.profiles x
  union all select 'duos', to_jsonb(x) from public.duos x
  union all select 'duo_members', to_jsonb(x) from public.duo_members x
  union all select 'duo_invitations', to_jsonb(x) from public.duo_invitations x
  union all select 'exercises', to_jsonb(x) from public.exercises x
  union all select 'programs', to_jsonb(x) from public.programs x
  union all select 'program_days', to_jsonb(x) from public.program_days x
  union all select 'program_exercises', to_jsonb(x) from public.program_exercises x
  union all select 'sessions', to_jsonb(x) from public.sessions x
  union all select 'session_sets', to_jsonb(x) from public.session_sets x
$$;

create temp table snap (k text, t text, j jsonb);

create function pg_temp.snapshot(p_k text)
 returns void
 language sql
as $$
  insert into snap select p_k, r.t, r.j from pg_temp.cm60_rows() r
$$;

-- Lignes présentes dans l'instantané p_from et absentes (ou différentes)
-- dans p_to, comptées par table : {"sessions": 2, ...}, '{}' si aucune.
create function pg_temp.diff(p_from text, p_to text)
 returns jsonb
 language sql
as $$
  select coalesce(jsonb_object_agg(t, n), '{}'::jsonb)
  from (
    select t, count(*) as n
    from (select t, j from snap where k = p_from
          except
          select t, j from snap where k = p_to) d
    group by t
  ) c
$$;

-- ---------------------------------------------------------------------------
-- Données de test (postgres)
-- ---------------------------------------------------------------------------

-- Solo : son exercice perso (seed) entre dans sa séance type ET dans une
-- série (les deux FK RESTRICT vers exercises sont en jeu).
insert into public.program_exercises (id, program_day_id, exercise_id, order_index, target_sets)
  values ('cccccccc-6060-0000-0000-000000000501', '99999999-9999-9999-9999-000000000002',
          '99999999-9999-9999-9999-000000000006', 1, 3);
insert into public.session_sets (id, session_id, exercise_id, set_index, weight_kg, reps)
  values ('cccccccc-6060-0000-0000-000000000502', '99999999-9999-9999-9999-000000000004',
          '99999999-9999-9999-9999-000000000006', 2, 12.5, 15);

-- Exercice du duo, dans la séance type du duo « Haut du corps ».
insert into public.exercises (id, name, muscle_group, duo_id) values
  ('cccccccc-6060-0000-0000-000000000e01', 'Exercice du duo', 'other',
   '33333333-3333-3333-3333-333333333333');
insert into public.program_exercises (id, program_day_id, exercise_id, order_index, target_sets) values
  ('cccccccc-6060-0000-0000-000000000601', '55555555-5555-5555-5555-000000000001',
   'cccccccc-6060-0000-0000-000000000e01', 4, 3);

-- Toi : deux exercices perso, une bibliothèque perso (« Bras », « Gainage »),
-- une séance sur « Bras ».
insert into public.exercises (id, name, muscle_group, owner_profile_id) values
  ('cccccccc-6060-0000-0000-000000000e02', 'Perso de Théo', 'other',
   '11111111-1111-1111-1111-111111111111'),
  -- Cas théorique : utilisé aussi par une série de Lina (voir plus bas).
  ('cccccccc-6060-0000-0000-000000000e03', 'Perso de Théo utilisé par Lina', 'other',
   '11111111-1111-1111-1111-111111111111');
insert into public.programs (id, name, owner_profile_id) values
  ('cccccccc-6060-0000-0000-000000000f01', 'Mes séances', '11111111-1111-1111-1111-111111111111');
insert into public.program_days (id, program_id, name, order_index) values
  ('cccccccc-6060-0000-0000-000000000d01', 'cccccccc-6060-0000-0000-000000000f01', 'Bras', 0),
  -- Cas théorique : Lina a une séance dessus (voir plus bas).
  ('cccccccc-6060-0000-0000-000000000d02', 'cccccccc-6060-0000-0000-000000000f01', 'Gainage', 1);
insert into public.program_exercises (id, program_day_id, exercise_id, order_index, target_sets) values
  ('cccccccc-6060-0000-0000-000000000701', 'cccccccc-6060-0000-0000-000000000d01',
   'cccccccc-6060-0000-0000-000000000e02', 0, 3),
  ('cccccccc-6060-0000-0000-000000000702', 'cccccccc-6060-0000-0000-000000000d01',
   'cccccccc-6060-0000-0000-000000000e01', 1, 3),
  ('cccccccc-6060-0000-0000-000000000703', 'cccccccc-6060-0000-0000-000000000d02',
   'fa91c9ba-5c32-4742-9397-e851ee4a9555', 0, 3);
insert into public.sessions (id, profile_id, program_day_id, performed_at, duration_seconds) values
  ('cccccccc-6060-0000-0000-000000000a01', '11111111-1111-1111-1111-111111111111',
   'cccccccc-6060-0000-0000-000000000d01', '2026-10-03 18:00:00+02', 2400);
insert into public.session_sets (id, session_id, exercise_id, set_index, weight_kg, reps) values
  ('cccccccc-6060-0000-0000-000000000b01', 'cccccccc-6060-0000-0000-000000000a01',
   'cccccccc-6060-0000-0000-000000000e02', 1, 20, 12),
  ('cccccccc-6060-0000-0000-000000000b02', 'cccccccc-6060-0000-0000-000000000a01',
   'cccccccc-6060-0000-0000-000000000e02', 2, 22.5, 10),
  ('cccccccc-6060-0000-0000-000000000b03', 'cccccccc-6060-0000-0000-000000000a01',
   'cccccccc-6060-0000-0000-000000000e01', 1, 30, 8);

-- Lina : trois séances (deux sur les séances types du duo, une sur
-- « Gainage » de Théo), avec l'exercice du duo et « Perso de Théo utilisé
-- par Lina ».
insert into public.sessions (id, profile_id, program_day_id, performed_at, duration_seconds) values
  ('cccccccc-6060-0000-0000-000000000a02', '22222222-2222-2222-2222-222222222222',
   '55555555-5555-5555-5555-000000000001', '2026-10-04 09:00:00+02', 3000),
  ('cccccccc-6060-0000-0000-000000000a03', '22222222-2222-2222-2222-222222222222',
   '55555555-5555-5555-5555-000000000002', '2026-10-05 09:00:00+02', 3300),
  ('cccccccc-6060-0000-0000-000000000a04', '22222222-2222-2222-2222-222222222222',
   'cccccccc-6060-0000-0000-000000000d02', '2026-10-06 09:00:00+02', 900);
insert into public.session_sets (id, session_id, exercise_id, set_index, weight_kg, reps) values
  ('cccccccc-6060-0000-0000-000000000c01', 'cccccccc-6060-0000-0000-000000000a02',
   '5c691ede-719c-4f3a-b714-34f91005f3dd', 1, 35, 10),
  ('cccccccc-6060-0000-0000-000000000c02', 'cccccccc-6060-0000-0000-000000000a02',
   '5c691ede-719c-4f3a-b714-34f91005f3dd', 2, 37.5, 8),
  ('cccccccc-6060-0000-0000-000000000c03', 'cccccccc-6060-0000-0000-000000000a02',
   'cccccccc-6060-0000-0000-000000000e01', 1, 15, 12),
  ('cccccccc-6060-0000-0000-000000000c04', 'cccccccc-6060-0000-0000-000000000a02',
   'cccccccc-6060-0000-0000-000000000e03', 1, 10, 15),
  ('cccccccc-6060-0000-0000-000000000c05', 'cccccccc-6060-0000-0000-000000000a03',
   '1e56eade-5cd1-4ea0-9742-9ac31b8c37ed', 1, 50, 8),
  ('cccccccc-6060-0000-0000-000000000c06', 'cccccccc-6060-0000-0000-000000000a03',
   '1e56eade-5cd1-4ea0-9742-9ac31b8c37ed', 2, 52.5, 8),
  ('cccccccc-6060-0000-0000-000000000c07', 'cccccccc-6060-0000-0000-000000000a04',
   'fa91c9ba-5c32-4742-9397-e851ee4a9555', 1, 40, 20);

-- Invitation historique du duo, créée par Théo et acceptée par Lina.
insert into public.duo_invitations (id, duo_id, created_by, code, accepted_by, accepted_at)
  values ('cccccccc-6060-0000-0000-000000000901', '33333333-3333-3333-3333-333333333333',
          '11111111-1111-1111-1111-111111111111', 'CM60AB',
          '22222222-2222-2222-2222-222222222222', now());

create temp table t_codes (k text primary key, code text);
grant all on t_codes to authenticated;

select pg_temp.snapshot('depart');

-- ---------------------------------------------------------------------------
-- 1. Structure et droits
-- ---------------------------------------------------------------------------

select ok((select p.prosecdef and p.proconfig @> array['search_path=""']
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'delete_my_account'),
          '1. delete_my_account : security definer, search_path vide');
select is((select pg_get_function_identity_arguments(p.oid)
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'delete_my_account'),
          'p_confirmation text',
          '1. un seul paramètre (le mot de confirmation) : aucun id de compte cible');
select ok(has_function_privilege('authenticated', 'public.delete_my_account(text)', 'execute'),
          '1. authenticated exécute delete_my_account');
select ok(not has_function_privilege('anon', 'public.delete_my_account(text)', 'execute')
          and not has_function_privilege('service_role', 'public.delete_my_account(text)', 'execute'),
          '1. anon et service_role : pas d''EXECUTE');
select ok((select p.proacl is not null
                  and not exists (select 1 from aclexplode(p.proacl) a
                                  where a.grantee = 0 and a.privilege_type = 'EXECUTE')
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'delete_my_account'),
          '1. PUBLIC : pas d''EXECUTE');
select is((select count(*)::int from pg_policies where schemaname = 'public'),
          22, '1. toujours 22 policies dans public');

-- ---------------------------------------------------------------------------
-- 2. Refus : rien n'est supprimé
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select public.delete_my_account('SUPPRIMER') $$, '42501', null,
                 '2. anon : refusé');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated"}';
select throws_ok($$ select public.delete_my_account('SUPPRIMER') $$,
                 'P0001', 'cm60:not_authenticated', '2. sans utilisateur : refusé');

set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select throws_ok($$ select public.delete_my_account('supprimer') $$,
                 'P0001', 'cm60:confirmation_required', '2. « supprimer » en minuscules : refusé');
select throws_ok($$ select public.delete_my_account(' SUPPRIMER ') $$,
                 'P0001', 'cm60:confirmation_required', '2. mot entouré d''espaces : refusé');
select throws_ok($$ select public.delete_my_account('') $$,
                 'P0001', 'cm60:confirmation_required', '2. mot vide : refusé');
select throws_ok($$ select public.delete_my_account(null) $$,
                 'P0001', 'cm60:confirmation_required', '2. null : refusé');
select throws_ok($$ select public.delete_my_account('OUI') $$,
                 'P0001', 'cm60:confirmation_required', '2. autre mot : refusé');
reset role;

select pg_temp.snapshot('refus');
select is(pg_temp.diff('depart', 'refus'), '{}'::jsonb, '2. après les refus : aucune ligne supprimée ni modifiée');
select is(pg_temp.diff('refus', 'depart'), '{}'::jsonb, '2. après les refus : aucune ligne ajoutée');

-- ---------------------------------------------------------------------------
-- 3. Solo (invitation en attente) supprime son compte
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select lives_ok($$ insert into t_codes select 'solo', code from public.create_duo_invitation() $$,
                '3. Solo a une invitation en attente (seul dans un duo)');
reset role;

select pg_temp.snapshot('solo_avant');

set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select lives_ok($$ select public.delete_my_account('SUPPRIMER') $$, '3. Solo supprime son compte');
-- Jeton encore valide après coup (autre appareil) : plus de compte.
select throws_ok($$ select public.delete_my_account('SUPPRIMER') $$,
                 'P0001', 'cm60:account_not_found', '3. second appel : plus de compte');
select is((select count(*)::int from public.sessions), 0, '3. RLS : plus aucune séance visible');
reset role;

select pg_temp.snapshot('solo_apres');

select is(pg_temp.diff('solo_avant', 'solo_apres'),
          jsonb_build_object(
            'auth.users', 1, 'auth.identities', 1, 'profiles', 1,
            'duos', 1, 'duo_members', 1, 'duo_invitations', 1,
            'exercises', 1, 'programs', 1, 'program_days', 1, 'program_exercises', 2,
            'sessions', 1, 'session_sets', 2),
          '3. lignes supprimées : exactement celles de Solo (compte, profil, duo en attente, invitation, exercice perso, programme, séance type, 2 exercices de séance type, séance, 2 séries)');
select is(pg_temp.diff('solo_apres', 'solo_avant'), '{}'::jsonb,
          '3. aucune autre ligne ajoutée ni modifiée');
select ok(not exists (select 1 from auth.users where id = '44444444-4444-4444-4444-444444444444')
          and not exists (select 1 from public.profiles where id = '44444444-4444-4444-4444-444444444444'),
          '3. compte Auth et profil de Solo supprimés');
select ok(not exists (select 1 from public.duo_invitations
                      where code = (select code from t_codes where k = 'solo')),
          '3. son invitation a disparu (le code ne peut plus servir)');
select is((select count(*)::int from public.exercises where owner_profile_id is null and duo_id is null),
          12, '3. catalogue système intact (12 exercices)');
select is((select count(*)::int from snap where k = 'solo_avant' and t = 'session_sets'
           and j ->> 'exercise_id' = '99999999-9999-9999-9999-000000000006'), 1,
          '3. son exercice perso était bien utilisé par une série (FK RESTRICT franchie)');

-- ---------------------------------------------------------------------------
-- 4. Théo (en duo avec Lina) supprime son compte
-- ---------------------------------------------------------------------------

select pg_temp.snapshot('toi_avant');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.delete_my_account('SUPPRIMER') $$, '4. Théo supprime son compte');
reset role;

select pg_temp.snapshot('toi_apres');

-- Supprimé : compte, identité, profil, ses 2 séances et leurs 10 séries, son
-- programme perso, « Bras » et ses 2 exercices, « Perso de Théo », le duo,
-- ses 2 membres, l'invitation, le programme du duo (vidé).
-- Modifié (ancienne version disparue, nouvelle ajoutée) : les 2 séances
-- types du duo et « Gainage » (rangées chez Lina), l'exercice du duo et
-- « Perso de Théo utilisé par Lina » (au nom de Lina).
-- Ajouté : le programme perso « Mes séances » de Lina.
select is(pg_temp.diff('toi_avant', 'toi_apres'),
          jsonb_build_object(
            'auth.users', 1, 'auth.identities', 1, 'profiles', 1,
            'duos', 1, 'duo_members', 2, 'duo_invitations', 1,
            'exercises', 3, 'programs', 2, 'program_days', 4, 'program_exercises', 2,
            'sessions', 2, 'session_sets', 10),
          '4. lignes supprimées ou modifiées : exactement l''attendu');
select is(pg_temp.diff('toi_apres', 'toi_avant'),
          jsonb_build_object('exercises', 2, 'programs', 1, 'program_days', 3),
          '4. lignes ajoutées ou modifiées : programme perso de Lina, 3 séances types rangées, 2 exercices passés à son nom');

-- Théo
select ok(not exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111')
          and not exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
          '4. compte Auth et profil de Théo supprimés');
select is((select count(*)::int from public.sessions where profile_id = '11111111-1111-1111-1111-111111111111'),
          0, '4. plus aucune séance de Théo');
select ok(not exists (select 1 from public.exercises where id = 'cccccccc-6060-0000-0000-000000000e02')
          and not exists (select 1 from public.program_days where id = 'cccccccc-6060-0000-0000-000000000d01')
          and not exists (select 1 from public.programs where id = 'cccccccc-6060-0000-0000-000000000f01'),
          '4. son exercice perso, « Bras » et son programme perso supprimés');

-- Lina : séances et séries identiques, au champ près.
select is((select count(*)::int from (
             select j from snap where k = 'toi_avant' and t = 'sessions'
               and j ->> 'profile_id' = '22222222-2222-2222-2222-222222222222'
             except
             select j from snap where k = 'toi_apres' and t = 'sessions') d),
          0, '4. les 3 séances de Lina sont intactes (aucun champ modifié)');
select is((select count(*)::int from public.sessions
           where profile_id = '22222222-2222-2222-2222-222222222222'),
          3, '4. Lina a toujours ses 3 séances');
select is((select count(*)::int from (
             select j from snap where k = 'toi_avant' and t = 'session_sets'
               and (j ->> 'session_id') in ('cccccccc-6060-0000-0000-000000000a02',
                                            'cccccccc-6060-0000-0000-000000000a03',
                                            'cccccccc-6060-0000-0000-000000000a04')
             except
             select j from snap where k = 'toi_apres' and t = 'session_sets') d),
          0, '4. ses 7 séries sont intactes');
select is((select count(*)::int from public.session_sets ss join public.sessions s on s.id = ss.session_id
           where s.profile_id = '22222222-2222-2222-2222-222222222222'),
          7, '4. Lina a toujours ses 7 séries');

-- Bibliothèque du duo : devenue celle de Lina (comme leave_duo).
select ok(not exists (select 1 from public.duos where id = '33333333-3333-3333-3333-333333333333')
          and not exists (select 1 from public.duo_members
                          where profile_id = '22222222-2222-2222-2222-222222222222'),
          '4. duo dissous : Lina est solo');
select results_eq(
  $$ select d.id, d.name from public.program_days d join public.programs p on p.id = d.program_id
     where p.owner_profile_id = '22222222-2222-2222-2222-222222222222' order by d.order_index $$,
  $$ values ('55555555-5555-5555-5555-000000000001'::uuid, 'Haut du corps'::text),
            ('55555555-5555-5555-5555-000000000002'::uuid, 'Bas du corps'::text),
            ('cccccccc-6060-0000-0000-000000000d02'::uuid, 'Gainage'::text) $$,
  '4. séances types du duo (mêmes ids, mêmes noms) et « Gainage » dans la bibliothèque perso de Lina');
select is((select count(*)::int from (
             select j from snap where k = 'toi_avant' and t = 'program_exercises'
               and (j ->> 'program_day_id') in ('55555555-5555-5555-5555-000000000001',
                                                '55555555-5555-5555-5555-000000000002',
                                                'cccccccc-6060-0000-0000-000000000d02')
             except
             select j from snap where k = 'toi_apres' and t = 'program_exercises') d),
          0, '4. exercices de ces séances types intacts (9 + 1)');
select ok((select owner_profile_id = '22222222-2222-2222-2222-222222222222' and duo_id is null
           from public.exercises where id = 'cccccccc-6060-0000-0000-000000000e01'),
          '4. l''exercice du duo est conservé, au nom de Lina');
select ok((select owner_profile_id = '22222222-2222-2222-2222-222222222222'
           from public.exercises where id = 'cccccccc-6060-0000-0000-000000000e03'),
          '4. l''exercice perso de Théo utilisé par une série de Lina lui est laissé');
select is((select count(*)::int from public.exercises where owner_profile_id is null and duo_id is null),
          12, '4. catalogue système intact');
select ok(exists (select 1 from public.profiles where id = '55555555-5555-5555-5555-555555555555')
          and exists (select 1 from auth.users where id = '55555555-5555-5555-5555-555555555555'),
          '4. Duo2 intact');

-- Lina, sous RLS : tout est visible, rien de Théo.
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.sessions), 3, '4. RLS Lina : ses 3 séances');
select is((select count(*)::int from public.session_sets), 7, '4. RLS Lina : ses 7 séries');
select is((select count(*)::int from public.program_days), 3, '4. RLS Lina : ses 3 séances types');
select is((select count(*)::int from public.exercises where owner_profile_id is not null), 2,
          '4. RLS Lina : ses 2 exercices perso (ex-duo, ex-Théo)');
select is((select count(*)::int from public.profiles), 1, '4. RLS Lina : plus que son profil');
reset role;

-- ---------------------------------------------------------------------------
-- 5. Bilan
-- ---------------------------------------------------------------------------

select is((select count(*)::int from auth.users), 2, '5. restent Lina et Duo2');

select * from finish();
rollback;
