-- CM-102 : limite d'essais des codes d'invitation duo. Lancé par
-- `supabase test db` (job e2e de la CI, après `supabase db reset`).
--
-- Seuils (cm102_check_invitation_attempts) : 10 échecs dans la dernière
-- heure, ou 30 dans les dernières 24 h, puis `cm102:too_many_attempts`.
--
-- Comptes du seed : Toi 1111… et Elle 2222… (duo 3333…), Solo 4444… (hors
-- duo, invite ici). Comptes créés ici, hors duo : Tiers C (essaie 10 mauvais
-- codes), Tiers D (autre utilisateur, non affecté), Tiers E (rejoint sans
-- aperçu), Tiers F (une autre invitation). RLS jouée sous `authenticated` (jeton simulé par
-- request.jwt.claims), `reset role` entre les cas. Transaction annulée.

begin;

create extension if not exists pgtap with schema extensions;

select plan(53);

-- ---------------------------------------------------------------------------
-- Données de test (postgres)
-- ---------------------------------------------------------------------------

insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0102-0000-0000-0000000000c1',
   'authenticated', 'authenticated', 'tiers-c@coach-en-muscu.test', '{"display_name":"Tiers C"}'),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0102-0000-0000-0000000000d1',
   'authenticated', 'authenticated', 'tiers-d@coach-en-muscu.test', '{"display_name":"Tiers D"}'),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0102-0000-0000-0000000000e1',
   'authenticated', 'authenticated', 'tiers-e@coach-en-muscu.test', '{"display_name":"Tiers E"}');

-- Invitations mortes du duo Toi / Elle : révoquée, expirée, déjà utilisée.
insert into public.duo_invitations (duo_id, created_by, code, revoked_at) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'REVKD2', now());
insert into public.duo_invitations (duo_id, created_by, code, expires_at) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'EXPRD2',
   now() - interval '1 minute');
insert into public.duo_invitations (duo_id, created_by, code, accepted_by, accepted_at) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', 'USED22',
   '22222222-2222-2222-2222-222222222222', now());

create temp table t_codes (k text primary key, code text);
grant all on t_codes to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Structure et droits
-- ---------------------------------------------------------------------------

select has_table('public', 'duo_invitation_attempts', '1. table des essais présente');
select ok((select relrowsecurity from pg_class
           where oid = 'public.duo_invitation_attempts'::regclass),
          '1. RLS activée sur la table des essais');
select is((select count(*)::int from pg_policies
           where schemaname = 'public' and tablename = 'duo_invitation_attempts'),
          0, '1. aucune policy sur la table des essais');
select is((select count(*)::int from pg_policies where schemaname = 'public'),
          22, '1. toujours 22 policies dans public');
select ok(not exists (
            select 1 from information_schema.role_table_grants
            where table_schema = 'public' and table_name = 'duo_invitation_attempts'
              and grantee in ('anon', 'authenticated', 'PUBLIC')),
          '1. aucun droit anon / authenticated sur la table des essais');
select ok(not has_function_privilege('authenticated', 'public.cm102_check_invitation_attempts(uuid)', 'execute')
          and not has_function_privilege('anon', 'public.cm102_check_invitation_attempts(uuid)', 'execute'),
          '1. garde interne : aucun droit client');
select ok((select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public'
             and p.proname in ('get_duo_invitation', 'accept_duo_invitation',
                               'cm102_check_invitation_attempts')),
          '1. security definer, search_path vide');
select ok(has_function_privilege('authenticated', 'public.get_duo_invitation(text)', 'execute')
          and has_function_privilege('authenticated', 'public.accept_duo_invitation(text, text)', 'execute')
          and not has_function_privilege('anon', 'public.get_duo_invitation(text)', 'execute')
          and not has_function_privilege('anon', 'public.accept_duo_invitation(text, text)', 'execute'),
          '1. RPC : authenticated seulement');

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from public.duo_invitation_attempts $$, '42501', null,
                 '1. anon ne lit pas la table des essais');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok($$ select * from public.duo_invitation_attempts $$, '42501', null,
                 '1. authenticated ne lit pas la table des essais');
select throws_ok($$ insert into public.duo_invitation_attempts (profile_id, success)
                    values ('aaaaaaaa-0102-0000-0000-0000000000c1', true) $$, '42501', null,
                 '1. authenticated n''écrit pas dans la table des essais');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Solo invite (bon code connu : fixé pour ne jamais tomber sur un des
--    mauvais codes ci-dessous).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';
select lives_ok($$ select * from public.create_duo_invitation() $$, '2. Solo invite');
reset role;
update public.duo_invitations set code = 'K7QM4P'
  where created_by = '44444444-4444-4444-4444-444444444444'
    and accepted_at is null and revoked_at is null;
insert into t_codes values ('bon', 'K7QM4P');

-- ---------------------------------------------------------------------------
-- 3. Tiers C : 10 mauvais codes (inconnus, mal formé, révoqué, expiré, déjà
--    utilisé). Aucune ligne, chaque échec est enregistré.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000c1","role":"authenticated"}';

select is_empty($$ select * from public.get_duo_invitation('ZZZZZ2') $$, '3. code inconnu (1)');
select is_empty($$ select * from public.get_duo_invitation('ZZZZZ3') $$, '3. code inconnu (2)');
select is_empty($$ select * from public.get_duo_invitation('ZZZZZ4') $$, '3. code inconnu (3)');
select is_empty($$ select * from public.get_duo_invitation('ZZZZZ5') $$, '3. code inconnu (4)');
select is_empty($$ select * from public.get_duo_invitation('ZZZZZ6') $$, '3. code inconnu (5)');
select is_empty($$ select * from public.get_duo_invitation('ZZZZZ7') $$, '3. code inconnu (6)');
select is_empty($$ select * from public.get_duo_invitation('ABC') $$, '3. code mal formé');
select is_empty($$ select * from public.get_duo_invitation('REVKD2') $$, '3. code révoqué');
select is_empty($$ select * from public.get_duo_invitation('EXPRD2') $$, '3. code expiré');
select is_empty($$ select * from public.get_duo_invitation('USED22') $$, '3. code déjà utilisé');
reset role;

select is((select count(*)::int from public.duo_invitation_attempts
           where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000c1' and not success),
          10, '3. 10 échecs enregistrés pour Tiers C');
select is((select count(*)::int from public.duo_invitation_attempts
           where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000c1' and invitation_id is not null),
          0, '3. un échec ne garde aucune trace du code');

-- ---------------------------------------------------------------------------
-- 4. Le 11e essai, même avec le bon code, est refusé.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok(
  $$ select * from public.get_duo_invitation((select code from t_codes where k = 'bon')) $$,
  'P0001', 'cm102:too_many_attempts', '4. aperçu du bon code refusé après 10 échecs');
select throws_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'bon'), '#5B8CFF') $$,
  'P0001', 'cm102:too_many_attempts', '4. acceptation du bon code refusée après 10 échecs');
select throws_ok($$ select * from public.get_duo_invitation('ZZZZZ8') $$,
  'P0001', 'cm102:too_many_attempts', '4. même erreur pour un mauvais code (rien n''est révélé)');
reset role;

select is((select count(*)::int from public.duo_members
           where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000c1'),
          0, '4. Tiers C n''a rejoint aucun duo');

-- ---------------------------------------------------------------------------
-- 5. Un autre utilisateur n'est pas affecté ; un succès ne compte pas comme
--    échec.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000d1","role":"authenticated"}';
select results_eq(
  $$ select inviter_name, color_conflict from public.get_duo_invitation((select code from t_codes where k = 'bon')) $$,
  $$ values ('Solo'::text, false) $$, '5. Tiers D voit l''aperçu du bon code');
reset role;

select is((select count(*)::int from public.duo_invitation_attempts
           where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000d1' and success
             and invitation_id is not null),
          1, '5. succès enregistré avec l''invitation (jamais le code)');

-- Tiers D : 9 échecs en plus de son succès, toujours sous le seuil.
insert into public.duo_invitation_attempts (profile_id, success)
  select 'aaaaaaaa-0102-0000-0000-0000000000d1', false from generate_series(1, 9);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000d1","role":"authenticated"}';
select isnt_empty(
  $$ select * from public.get_duo_invitation((select code from t_codes where k = 'bon')) $$,
  '5. 9 échecs et des succès : toujours sous le seuil');
select is_empty($$ select * from public.get_duo_invitation('ZZZZZ9') $$, '5. 10e échec de Tiers D');
select throws_ok(
  $$ select * from public.get_duo_invitation((select code from t_codes where k = 'bon')) $$,
  'P0001', 'cm102:too_many_attempts', '5. Tiers D bloqué à son tour à 10 échecs');
reset role;

-- ---------------------------------------------------------------------------
-- 6. Rejoindre exige l'aperçu du code.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000e1","role":"authenticated"}';
select throws_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'bon')) $$,
  'P0001', 'cm87:invitation_invalid', '6. sans aperçu : même refus qu''un code inconnu');
-- Code expiré non révoqué, jamais vu : même erreur générique (pas
-- invitation_expired, qui révélerait que le code a existé).
select throws_ok(
  $$ select public.accept_duo_invitation('EXPRD2') $$,
  'P0001', 'cm87:invitation_invalid', '6. code expiré sans aperçu : erreur générique');
select throws_ok(
  $$ select public.accept_duo_invitation('ZZZZY3') $$,
  'P0001', 'cm87:invitation_invalid', '6. code inconnu : même erreur');
reset role;

-- Tiers D a vu l'aperçu du bon code de Solo (cas 5) : il ne lui permet pas
-- d'accepter une AUTRE invitation (celle de Tiers F).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0102-0000-0000-0000000000f1',
   'authenticated', 'authenticated', 'tiers-f@coach-en-muscu.test', '{"display_name":"Tiers F"}');
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000f1","role":"authenticated"}';
select lives_ok($$ select * from public.create_duo_invitation() $$, '6. Tiers F invite');
reset role;
update public.duo_invitations set code = 'FFFFF2'
  where created_by = 'aaaaaaaa-0102-0000-0000-0000000000f1'
    and accepted_at is null and revoked_at is null;
-- Tiers D repasse sous le seuil (ses échecs du cas 5 vieillis).
update public.duo_invitation_attempts set attempted_at = now() - interval '25 hours'
  where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000d1' and not success;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok(
  $$ select public.accept_duo_invitation('FFFFF2', '#5B8CFF') $$,
  'P0001', 'cm87:invitation_invalid', '6. aperçu d''une autre invitation : refus');
reset role;
select is((select count(*)::int from public.duo_members
           where profile_id in ('aaaaaaaa-0102-0000-0000-0000000000d1',
                                'aaaaaaaa-0102-0000-0000-0000000000e1')),
          0, '6. Tiers D et Tiers E toujours hors duo');

-- Une ancienne invitation au même code, vue autrefois, ne suffit pas : le
-- code de Solo passe à Tiers F (invitation de Solo révoquée).
update public.duo_invitations set revoked_at = now()
  where created_by = '44444444-4444-4444-4444-444444444444' and code = 'K7QM4P';
update public.duo_invitations set code = 'K7QM4P'
  where created_by = 'aaaaaaaa-0102-0000-0000-0000000000f1' and code = 'FFFFF2';
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000d1","role":"authenticated"}';
select throws_ok(
  $$ select public.accept_duo_invitation('K7QM4P', '#5B8CFF') $$,
  'P0001', 'cm87:invitation_invalid', '6. même code, autre invitation : refus');
reset role;
-- Retour à l'état précédent pour la suite (Solo réinvite avec le même code).
update public.duo_invitations set code = 'FFFFF2'
  where created_by = 'aaaaaaaa-0102-0000-0000-0000000000f1' and code = 'K7QM4P';
update public.duo_invitations set revoked_at = null
  where created_by = '44444444-4444-4444-4444-444444444444' and code = 'K7QM4P';

-- ---------------------------------------------------------------------------
-- 7. Le blocage expire (lignes vieillies).
-- ---------------------------------------------------------------------------
update public.duo_invitation_attempts set attempted_at = attempted_at - interval '61 minutes'
  where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000c1';

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000c1","role":"authenticated"}';
select isnt_empty(
  $$ select * from public.get_duo_invitation((select code from t_codes where k = 'bon')) $$,
  '7. une heure plus tard : Tiers C revoit l''aperçu');
reset role;

-- Plafond sur 24 h : 30 échecs vieux de 2 h bloquent encore.
insert into public.duo_invitation_attempts (profile_id, success, attempted_at)
  select 'aaaaaaaa-0102-0000-0000-0000000000c1', false, now() - interval '2 hours'
  from generate_series(1, 20);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000c1","role":"authenticated"}';
select throws_ok(
  $$ select * from public.get_duo_invitation((select code from t_codes where k = 'bon')) $$,
  'P0001', 'cm102:too_many_attempts', '7. 30 échecs sur 24 h : bloqué');
reset role;

update public.duo_invitation_attempts set attempted_at = now() - interval '25 hours'
  where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000c1' and not success;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000c1","role":"authenticated"}';
select isnt_empty(
  $$ select * from public.get_duo_invitation((select code from t_codes where k = 'bon')) $$,
  '7. plus de 24 h après : débloqué');
select lives_ok(
  $$ select public.accept_duo_invitation((select code from t_codes where k = 'bon'), '#5B8CFF') $$,
  '7. Tiers C rejoint Solo avec le bon code (aperçu vu)');
reset role;

select is((select count(*)::int from public.duo_members dm
           join public.duo_members solo on solo.duo_id = dm.duo_id
           where dm.profile_id = 'aaaaaaaa-0102-0000-0000-0000000000c1'
             and solo.profile_id = '44444444-4444-4444-4444-444444444444'),
          1, '7. Tiers C et Solo en duo');
select is((select count(*)::int from public.duo_invitation_attempts
           where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000c1' and not success),
          30, '7. un succès n''efface pas l''historique (30 échecs gardés)');

-- ---------------------------------------------------------------------------
-- 8. Purge des lignes de plus de 7 jours à chaque appel.
-- ---------------------------------------------------------------------------
update public.duo_invitation_attempts set attempted_at = now() - interval '8 days'
  where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000c1' and not success;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000e1","role":"authenticated"}';
select is_empty($$ select * from public.get_duo_invitation('ZZZZY2') $$, '8. un appel quelconque');
reset role;

select is((select count(*)::int from public.duo_invitation_attempts
           where attempted_at < now() - interval '7 days'),
          0, '8. lignes de plus de 7 jours purgées');
select is((select count(*)::int from public.duo_invitation_attempts
           where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000c1'),
          2, '8. les lignes récentes restent (2 succès de Tiers C)');

-- ---------------------------------------------------------------------------
-- 9. Rien d'autre ne change : Toi / Elle toujours en duo, invitation de
--    l'appelant non comptée (son propre code reste une erreur levée).
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0102-0000-0000-0000000000e1","role":"authenticated"}';
select lives_ok(
  $$ insert into t_codes select 'e', code from public.create_duo_invitation() $$,
  '9. Tiers E invite');
select throws_ok(
  $$ select * from public.get_duo_invitation((select code from t_codes where k = 'e')) $$,
  'P0001', 'cm87:invitation_self', '9. son propre code : erreur levée, comme avant');
reset role;

select is((select count(*)::int from public.duo_invitation_attempts
           where profile_id = 'aaaaaaaa-0102-0000-0000-0000000000e1' and not success),
          1, '9. son propre code ne compte pas comme échec');
select is((select count(*)::int from public.duo_members
           where duo_id = '33333333-3333-3333-3333-333333333333'),
          2, '9. duo Toi / Elle intact');

select * from finish();

rollback;
