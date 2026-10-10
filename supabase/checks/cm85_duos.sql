-- CM-85 : vérifications SQL du modèle duo sur la base LOCALE seedée
-- (modèle duo seul depuis CM-99 ; le XOR sur duo_id est testé en pgTAP,
-- supabase/tests/cm99_schema.test.sql).
-- Lancé par la CI (job e2e) après `supabase db reset` :
--   docker exec -i supabase_db_coach-en-muscu psql -U postgres -v ON_ERROR_STOP=1 < supabase/checks/cm85_duos.sql
-- Tout se passe dans une transaction annulée à la fin : la base de test reste
-- intacte pour les e2e. Un échec lève une exception (psql sort en erreur).

\set ON_ERROR_STOP 1
begin;

-- Utilisateurs de test (le trigger on_auth_user_created crée leurs profils).
insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'tiers1@coach-en-muscu.test', '{"display_name":"Tiers 1"}'),
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'tiers2@coach-en-muscu.test', '{"display_name":"Tiers 2"}');

do $$
declare
  v_ok boolean;
begin
  -- 0. Seed : duo 3333… avec 2 membres, programme « Nos séances » du duo.
  if (select count(*) from public.duo_members
      where duo_id = '33333333-3333-3333-3333-333333333333') <> 2 then
    raise exception 'ÉCHEC : le duo 3333… doit avoir 2 membres';
  end if;
  if not exists (select 1 from public.programs
                 where id = '44444444-4444-4444-4444-444444444444'
                   and duo_id = '33333333-3333-3333-3333-333333333333'
                   and owner_profile_id is null) then
    raise exception 'ÉCHEC : le programme « Nos séances » doit appartenir au duo 3333…';
  end if;
  if (select count(*) from public.profiles) <> 5 then
    raise exception 'ÉCHEC : le trigger aurait dû créer 2 profils de test (total 5 : Toi, Elle, Solo CM-59 + 2)';
  end if;

  -- 1. Deux membres max par duo.
  v_ok := false;
  begin
    insert into public.duo_members (duo_id, profile_id)
      values ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-0000-0000-0000-000000000001');
  exception when check_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'ÉCHEC : un 3e membre a pu rejoindre un duo'; end if;

  -- 2. Un seul duo par membre.
  insert into public.duos (id, name) values ('bbbbbbbb-0000-0000-0000-000000000001', 'Autre duo');
  insert into public.duo_members (duo_id, profile_id)
    values ('bbbbbbbb-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001');
  v_ok := false;
  begin
    insert into public.duo_members (duo_id, profile_id)
      values ('bbbbbbbb-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111');
  exception when unique_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'ÉCHEC : un membre a pu rejoindre un 2e duo'; end if;

  -- 3. Profil sans compte Auth refusé (FK profiles.id → auth.users).
  v_ok := false;
  begin
    insert into public.profiles (id, display_name)
      values ('cccccccc-0000-0000-0000-000000000001', 'Sans compte');
  exception when foreign_key_violation then v_ok := true;
  end;
  if not v_ok then raise exception 'ÉCHEC : un profil sans compte Auth a été accepté'; end if;

  -- 4. Rien d'ouvert à anon.
  if has_table_privilege('anon', 'public.duos', 'select')
     or has_table_privilege('anon', 'public.duo_members', 'select')
     or has_table_privilege('anon', 'public.duo_invitations', 'select')
     or has_function_privilege('anon', 'public.my_duo_id()', 'execute')
     or has_function_privilege('anon', 'public.is_duo_member(uuid)', 'execute') then
    raise exception 'ÉCHEC : droits anon sur les tables / fonctions duo';
  end if;
  if exists (select 1 from pg_class
             where oid in ('public.duos'::regclass, 'public.duo_members'::regclass,
                           'public.duo_invitations'::regclass)
               and not relrowsecurity) then
    raise exception 'ÉCHEC : RLS non activée sur une table duo';
  end if;

  raise notice 'CM-85 : vérifications SQL duo OK';
end $$;

rollback;
