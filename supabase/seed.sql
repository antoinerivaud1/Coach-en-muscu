-- ============================================================================
-- Données de test (CM-85 PR 0) : base locale / CI uniquement.
-- Chargé automatiquement par `supabase db reset` (config.toml, [db.seed]).
--
-- Tout est fictif, SAUF :
--   - les uuid des 2 profils et du duo, identiques à la prod car l'app
--     les utilise comme profils fixes (cookie cm_profile) ;
--   - les exercices système (catalogue commun, duo_id NULL), copiés de la
--     prod avec leurs uuid : ce sont des données de catalogue, non personnelles.
-- Aucune séance, série ni email réels.
-- ============================================================================

-- Comptes Auth (CM-85) ---------------------------------------------------------
-- `profiles.id` référence `auth.users(id)` : les comptes passent AVANT les
-- profils. Emails en `.test` (domaine réservé, jamais routé) et mot de passe
-- de test fictif, base locale uniquement. Colonnes texte à '' : GoTrue local
-- refuse les NULL sur les jetons à la connexion par mot de passe.
-- Le trigger `on_auth_user_created` crée déjà les profils ; l'insert de
-- profils plus bas fixe leurs valeurs exactes (`on conflict do update`).

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
   'authenticated', 'authenticated', 'toi@coach-en-muscu.test',
   extensions.crypt('motdepasse-de-test', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Toi","color_role":"toi"}',
   now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-2222-2222-222222222222',
   'authenticated', 'authenticated', 'elle@coach-en-muscu.test',
   extensions.crypt('motdepasse-de-test', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Elle","color_role":"elle"}',
   now(), now(), '', '', '', ''),
  -- CM-59 : compte « Solo », HORS duo (tests RLS : ne voit rien du duo).
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-4444-444444444444',
   'authenticated', 'authenticated', 'solo@coach-en-muscu.test',
   extensions.crypt('motdepasse-de-test', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"display_name":"Solo","color_role":"toi"}',
   now(), now(), '', '', '', '');

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values
  ('11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111', 'email',
   '{"sub":"11111111-1111-1111-1111-111111111111","email":"toi@coach-en-muscu.test","email_verified":true}',
   now(), now(), now()),
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222', 'email',
   '{"sub":"22222222-2222-2222-2222-222222222222","email":"elle@coach-en-muscu.test","email_verified":true}',
   now(), now(), now()),
  ('44444444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444',
   '44444444-4444-4444-4444-444444444444', 'email',
   '{"sub":"44444444-4444-4444-4444-444444444444","email":"solo@coach-en-muscu.test","email_verified":true}',
   now(), now(), now());

-- Profils et duo ----------------------------------------------------------------

insert into public.profiles (id, display_name, color_role, weekly_goal) values
  ('11111111-1111-1111-1111-111111111111', 'Toi',  'toi',  4),
  ('22222222-2222-2222-2222-222222222222', 'Elle', 'elle', 3),
  ('44444444-4444-4444-4444-444444444444', 'Solo', 'toi',  3)
on conflict (id) do update set
  display_name = excluded.display_name,
  color_role   = excluded.color_role,
  weekly_goal  = excluded.weekly_goal;

-- Duo « Nous » (CM-85), uuid identique à la prod.
insert into public.duos (id, name) values
  ('33333333-3333-3333-3333-333333333333', 'Nous');

insert into public.duo_members (duo_id, profile_id) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111'),
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222');

-- Exercices système (extrait du catalogue prod, 12 sur 81) ---------------------

insert into public.exercises (id, name, muscle_group, is_compound, duo_id) values
  ('5c691ede-719c-4f3a-b714-34f91005f3dd', 'Développé couché barre',        'chest',      true,  null),
  ('fd03f868-f416-46da-8fad-bc6eda6e0f93', 'Développé incliné haltères',    'chest',      true,  null),
  ('c0a6396d-079d-4d92-ae55-5d409c817d41', 'Tirage vertical poulie',        'back',       true,  null),
  ('ec0fd3e3-1557-4609-97b5-63e0dfac420d', 'Rowing barre',                  'back',       true,  null),
  ('268a385b-1edd-406c-bdfa-16b46b9e73c3', 'Développé militaire barre',     'shoulders',  true,  null),
  ('318ece56-abbe-40c8-9888-fd2954260b5d', 'Élévations latérales haltères', 'shoulders',  false, null),
  ('20cc6ddc-14b4-4483-a884-e7fdfab09252', 'Curl haltères',                 'biceps',     false, null),
  ('41171bd9-9d61-4a90-9edd-d1fbfe5d1567', 'Extension corde poulie',        'triceps',    false, null),
  ('1e56eade-5cd1-4ea0-9742-9ac31b8c37ed', 'Squat barre',                   'quads',      true,  null),
  ('0cada924-d7df-462b-8614-44f4904624a0', 'Soulevé de terre roumain',      'hamstrings', true,  null),
  ('3b78856b-d1da-4d48-9810-0231daf8a067', 'Hip thrust',                    'glutes',     true,  null),
  ('fa91c9ba-5c32-4742-9397-e851ee4a9555', 'Mollets debout',                'calves',     false, null);

-- Programme partagé « Nos séances » (SHARED_PROGRAM_NAME, CM-81) -------------

insert into public.programs (id, name, owner_profile_id, duo_id) values
  ('44444444-4444-4444-4444-444444444444', 'Nos séances', null,
   '33333333-3333-3333-3333-333333333333');

insert into public.program_days (id, program_id, name, order_index) values
  ('55555555-5555-5555-5555-000000000001', '44444444-4444-4444-4444-444444444444', 'Haut du corps', 0),
  ('55555555-5555-5555-5555-000000000002', '44444444-4444-4444-4444-444444444444', 'Bas du corps',  1);

insert into public.program_exercises
  (id, program_day_id, exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, notes)
values
  -- Haut du corps
  ('66666666-6666-6666-6666-000000000001', '55555555-5555-5555-5555-000000000001', '5c691ede-719c-4f3a-b714-34f91005f3dd', 0, 4, 6,  8,  150, null),
  ('66666666-6666-6666-6666-000000000002', '55555555-5555-5555-5555-000000000001', 'c0a6396d-079d-4d92-ae55-5d409c817d41', 1, 3, 8,  12, 90,  null),
  ('66666666-6666-6666-6666-000000000003', '55555555-5555-5555-5555-000000000001', '318ece56-abbe-40c8-9888-fd2954260b5d', 2, 3, 12, 15, 60,  'Tempo contrôlé'),
  ('66666666-6666-6666-6666-000000000004', '55555555-5555-5555-5555-000000000001', '20cc6ddc-14b4-4483-a884-e7fdfab09252', 3, 3, 10, 12, 60,  null),
  -- Bas du corps
  ('66666666-6666-6666-6666-000000000005', '55555555-5555-5555-5555-000000000002', '1e56eade-5cd1-4ea0-9742-9ac31b8c37ed', 0, 4, 5,  8,  180, null),
  ('66666666-6666-6666-6666-000000000006', '55555555-5555-5555-5555-000000000002', '0cada924-d7df-462b-8614-44f4904624a0', 1, 3, 8,  10, 120, null),
  ('66666666-6666-6666-6666-000000000007', '55555555-5555-5555-5555-000000000002', '3b78856b-d1da-4d48-9810-0231daf8a067', 2, 3, 10, 12, 90,  null),
  ('66666666-6666-6666-6666-000000000008', '55555555-5555-5555-5555-000000000002', 'fa91c9ba-5c32-4742-9397-e851ee4a9555', 3, 3, 12, 15, 60,  null);

-- Une séance TERMINÉE (duration_seconds renseigné, CM-83) ---------------------

insert into public.sessions (id, profile_id, program_day_id, performed_at, feedback, notes, duration_seconds) values
  ('77777777-7777-7777-7777-000000000001', '11111111-1111-1111-1111-111111111111',
   '55555555-5555-5555-5555-000000000001', '2026-10-01 18:30:00+02', 'normal', 'Séance de test (seed)', 3420);

insert into public.session_sets (id, session_id, exercise_id, set_index, weight_kg, reps, rpe, is_warmup) values
  ('88888888-8888-8888-8888-000000000001', '77777777-7777-7777-7777-000000000001', '5c691ede-719c-4f3a-b714-34f91005f3dd', 1, 40.00, 10, null, true),
  ('88888888-8888-8888-8888-000000000002', '77777777-7777-7777-7777-000000000001', '5c691ede-719c-4f3a-b714-34f91005f3dd', 2, 70.00, 8,  7,    false),
  ('88888888-8888-8888-8888-000000000003', '77777777-7777-7777-7777-000000000001', '5c691ede-719c-4f3a-b714-34f91005f3dd', 3, 72.50, 7,  8,    false),
  ('88888888-8888-8888-8888-000000000004', '77777777-7777-7777-7777-000000000001', '5c691ede-719c-4f3a-b714-34f91005f3dd', 4, 72.50, 6,  9,    false),
  ('88888888-8888-8888-8888-000000000005', '77777777-7777-7777-7777-000000000001', 'c0a6396d-079d-4d92-ae55-5d409c817d41', 1, 55.00, 12, 7,    false),
  ('88888888-8888-8888-8888-000000000006', '77777777-7777-7777-7777-000000000001', 'c0a6396d-079d-4d92-ae55-5d409c817d41', 2, 55.00, 10, 8,    false),
  ('88888888-8888-8888-8888-000000000007', '77777777-7777-7777-7777-000000000001', 'c0a6396d-079d-4d92-ae55-5d409c817d41', 3, 55.00, 9,  9,    false);

-- CM-59 : données du compte « Solo » (hors duo) --------------------------------
-- Programme perso (owner_profile_id = Solo, duo_id null), une séance type, un
-- exercice système, une séance terminée et une série. Sert aux tests RLS
-- (supabase/tests/rls.test.sql) : Solo ne doit rien voir du duo, et le duo
-- rien de Solo. Le sélecteur de profil (mode cookie, service-role) affiche
-- désormais 3 cartes ; les e2e ciblent « Toi » par son nom (E2E_PROFILE_NAME).
-- Nb : l'uuid 4444… du profil Solo est aussi celui du programme « Nos
-- séances » (tables différentes, aucun conflit).

insert into public.programs (id, name, owner_profile_id, duo_id) values
  ('99999999-9999-9999-9999-000000000001', 'Programme solo',
   '44444444-4444-4444-4444-444444444444', null);

insert into public.program_days (id, program_id, name, order_index) values
  ('99999999-9999-9999-9999-000000000002', '99999999-9999-9999-9999-000000000001', 'Full body', 0);

insert into public.program_exercises
  (id, program_day_id, exercise_id, order_index, target_sets, target_reps_min, target_reps_max, rest_seconds, notes)
values
  ('99999999-9999-9999-9999-000000000003', '99999999-9999-9999-9999-000000000002',
   '1e56eade-5cd1-4ea0-9742-9ac31b8c37ed', 0, 3, 8, 10, 120, null);

insert into public.sessions (id, profile_id, program_day_id, performed_at, feedback, notes, duration_seconds) values
  ('99999999-9999-9999-9999-000000000004', '44444444-4444-4444-4444-444444444444',
   '99999999-9999-9999-9999-000000000002', '2026-10-02 12:00:00+02', 'easy', 'Séance solo (seed)', 1800);

insert into public.session_sets (id, session_id, exercise_id, set_index, weight_kg, reps, rpe, is_warmup) values
  ('99999999-9999-9999-9999-000000000005', '99999999-9999-9999-9999-000000000004',
   '1e56eade-5cd1-4ea0-9742-9ac31b8c37ed', 1, 60.00, 10, 7, false);
