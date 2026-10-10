-- ============================================================================
-- CM-59 livraison A : fichier UNIQUE à coller dans Supabase, SQL Editor (PROD).
--
-- Contenu = les deux migrations du repo, À L'IDENTIQUE, dans une transaction :
--   supabase/migrations/20261010090000_cm59_rls_policies.sql
--   supabase/migrations/20261010090100_cm59_grants.sql
-- Si une instruction échoue, rien n'est appliqué (rollback automatique).
-- Rejouable : relancer le fichier sur une base déjà migrée ne change rien
-- (toutes les policies des tables concernées sont supprimées puis recréées,
-- `drop ... if exists` partout, revoke / grant idempotents).
--
-- Inerte pour l'app : elle passe par la service-role (bypass RLS, droits
-- inchangés). Les clients anon / authenticated n'interrogent aucune table
-- aujourd'hui (seul l'Auth utilise la clé anon).
--
-- À appliquer AVANT de merger la PR. La dernière requête renvoie UNE ligne :
-- `ok` doit valoir true (22 policies, aucune ne parle de couple, rien pour
-- anon, pas de TRUNCATE pour authenticated, SELECT sur duo_members, et les
-- séances toujours là).
--
-- Retour arrière : bloc commenté en bas du fichier.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 20261010090000_cm59_rls_policies.sql
-- ---------------------------------------------------------------------------

-- CM-59 livraison A (« schéma ») : policies RLS par duo.
--
-- Remplace les 22 policies héritées du modèle couple (baseline, fonctions
-- `user_couple_id()` / `accessible_profile_ids()`) par des policies écrites
-- sur le modèle duo, avec les helpers de CM-85 partie A (security definer,
-- search_path vide) :
--   my_duo_id(), is_duo_member(uuid), visible_profile_ids(),
--   can_access_program(uuid).
--
-- Règles :
-- - toutes les policies sont `to authenticated` (anon n'a plus aucun droit,
--   voir la migration de grants qui suit) ;
-- - `auth.uid()` toujours écrit `(select auth.uid())` (évalué une fois par
--   requête, pas une fois par ligne) ;
-- - aucune policy ne mentionne couple_id, couples ni user_couple_id ;
-- - couples / couple_members / duo_invitations : RLS active, AUCUNE policy
--   (seule la service-role y accède).
--
-- Inerte pour l'app : elle passe par la service-role (bypass RLS, CM-17).
--
-- Rejouable : toutes les policies des tables concernées sont supprimées
-- (noms connus puis balayage de pg_policies, au cas où la prod porterait une
-- policy absente du repo) avant d'être recréées.

-- 1. Anciennes policies (noms de la baseline) ----------------------------------

drop policy if exists profiles_select_self_or_partner      on public.profiles;
drop policy if exists profiles_update_self                 on public.profiles;
drop policy if exists couples_select_member                on public.couples;
drop policy if exists couples_insert_when_not_in_couple    on public.couples;
drop policy if exists couple_members_select_self_or_couple on public.couple_members;
drop policy if exists couple_members_insert_self           on public.couple_members;
drop policy if exists exercises_select_system_or_couple    on public.exercises;
drop policy if exists exercises_insert_couple              on public.exercises;
drop policy if exists exercises_update_couple              on public.exercises;
drop policy if exists exercises_delete_couple              on public.exercises;
drop policy if exists programs_select                      on public.programs;
drop policy if exists programs_insert                      on public.programs;
drop policy if exists programs_update                      on public.programs;
drop policy if exists programs_delete                      on public.programs;
drop policy if exists program_days_all                     on public.program_days;
drop policy if exists program_exercises_all                on public.program_exercises;
drop policy if exists sessions_select_self_or_partner      on public.sessions;
drop policy if exists sessions_insert_self                 on public.sessions;
drop policy if exists sessions_update_self                 on public.sessions;
drop policy if exists sessions_delete_self                 on public.sessions;
drop policy if exists session_sets_select                  on public.session_sets;
drop policy if exists session_sets_modify_self             on public.session_sets;

-- Filet : toute autre policy encore posée sur ces tables (écart prod / repo,
-- ou policies CM-59 d'un passage précédent) est supprimée aussi.
do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles', 'couples', 'couple_members',
        'duos', 'duo_members', 'duo_invitations',
        'exercises', 'programs', 'program_days', 'program_exercises',
        'sessions', 'session_sets'
      )
  loop
    execute format('drop policy if exists %I on %I.%I',
                   r.policyname, r.schemaname, r.tablename);
  end loop;
end
$$;

-- 2. Helpers du modèle couple ----------------------------------------------------
-- Plus aucune policy ne les utilise. Pas de `cascade` : si un objet en
-- dépendait encore, la migration échouerait ici au lieu de le supprimer.

drop function if exists public.accessible_profile_ids();
drop function if exists public.user_couple_id();

-- 3. RLS active partout (déjà le cas ; réaffirmé) -------------------------------

alter table public.profiles          enable row level security;
alter table public.couples           enable row level security;
alter table public.couple_members    enable row level security;
alter table public.duos              enable row level security;
alter table public.duo_members       enable row level security;
alter table public.duo_invitations   enable row level security;
alter table public.exercises         enable row level security;
alter table public.programs          enable row level security;
alter table public.program_days      enable row level security;
alter table public.program_exercises enable row level security;
alter table public.sessions          enable row level security;
alter table public.session_sets      enable row level security;

-- 4. Séance créée par un client connecté : profil = utilisateur courant -------
-- Sans effet pour la service-role (l'app renseigne toujours profile_id ;
-- auth.uid() y vaut null, la contrainte not null resterait la garde).

alter table public.sessions alter column profile_id set default auth.uid();

-- 5. Policies ---------------------------------------------------------------------

-- profiles : moi et mon partenaire de duo en lecture, moi seul en écriture
-- (colonnes modifiables restreintes par les grants).
create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (id in (select public.visible_profile_ids()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- duos / duo_members : lecture par les membres du duo. Écriture : service-role
-- seulement (création / invitation via le serveur, CM-87).
create policy duos_select_member on public.duos
  for select to authenticated
  using (public.is_duo_member(id));

create policy duo_members_select_member on public.duo_members
  for select to authenticated
  using (public.is_duo_member(duo_id));

-- duo_invitations : aucune policy (service-role seulement).

-- exercises : catalogue système (duo_id null) + exercices de mon duo.
create policy exercises_select_system_or_duo on public.exercises
  for select to authenticated
  using (duo_id is null or public.is_duo_member(duo_id));

create policy exercises_insert_duo on public.exercises
  for insert to authenticated
  with check (duo_id is not null and duo_id = (select public.my_duo_id()));

create policy exercises_update_duo on public.exercises
  for update to authenticated
  using (duo_id is not null and public.is_duo_member(duo_id))
  with check (duo_id is not null and public.is_duo_member(duo_id));

create policy exercises_delete_duo on public.exercises
  for delete to authenticated
  using (duo_id is not null and public.is_duo_member(duo_id));

-- programs : programme perso (owner_profile_id = moi, duo_id null) ou
-- programme du duo (owner_profile_id null, duo_id = mon duo).
create policy programs_select_owner_or_duo on public.programs
  for select to authenticated
  using (
    owner_profile_id = (select auth.uid())
    or (duo_id is not null and public.is_duo_member(duo_id))
  );

create policy programs_insert_owner_or_duo on public.programs
  for insert to authenticated
  with check (
    (owner_profile_id = (select auth.uid()) and duo_id is null)
    or (owner_profile_id is null and duo_id = (select public.my_duo_id()))
  );

create policy programs_update_owner_or_duo on public.programs
  for update to authenticated
  using (
    owner_profile_id = (select auth.uid())
    or (duo_id is not null and public.is_duo_member(duo_id))
  )
  with check (
    (owner_profile_id = (select auth.uid()) and duo_id is null)
    or (owner_profile_id is null and duo_id = (select public.my_duo_id()))
  );

create policy programs_delete_owner_or_duo on public.programs
  for delete to authenticated
  using (
    owner_profile_id = (select auth.uid())
    or (duo_id is not null and public.is_duo_member(duo_id))
  );

-- program_days : suivent l'accès au programme.
create policy program_days_all_accessible on public.program_days
  for all to authenticated
  using (public.can_access_program(program_id))
  with check (public.can_access_program(program_id));

-- program_exercises : suivent l'accès au programme du jour ; en écriture,
-- l'exercice doit être visible (catalogue système ou exercice du duo).
create policy program_exercises_all_accessible on public.program_exercises
  for all to authenticated
  using (
    exists (
      select 1 from public.program_days d
      where d.id = program_exercises.program_day_id
        and public.can_access_program(d.program_id)
    )
  )
  with check (
    exists (
      select 1 from public.program_days d
      where d.id = program_exercises.program_day_id
        and public.can_access_program(d.program_id)
    )
    and exists (
      select 1 from public.exercises e
      where e.id = program_exercises.exercise_id
    )
  );

-- sessions : lecture de mes séances et de celles de mon partenaire ;
-- écriture sur mes séances seulement, rattachées (le cas échéant) à une
-- séance type d'un programme accessible.
create policy sessions_select_visible on public.sessions
  for select to authenticated
  using (profile_id in (select public.visible_profile_ids()));

create policy sessions_insert_self on public.sessions
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and (
      program_day_id is null
      or exists (
        select 1 from public.program_days d
        where d.id = sessions.program_day_id
          and public.can_access_program(d.program_id)
      )
    )
  );

create policy sessions_update_self on public.sessions
  for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (
    profile_id = (select auth.uid())
    and (
      program_day_id is null
      or exists (
        select 1 from public.program_days d
        where d.id = sessions.program_day_id
          and public.can_access_program(d.program_id)
      )
    )
  );

create policy sessions_delete_self on public.sessions
  for delete to authenticated
  using (profile_id = (select auth.uid()));

-- session_sets : lecture des séries des séances visibles, écriture sur les
-- séries de mes séances.
create policy session_sets_select_visible on public.session_sets
  for select to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_sets.session_id
        and s.profile_id in (select public.visible_profile_ids())
    )
  );

create policy session_sets_insert_self on public.session_sets
  for insert to authenticated
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_sets.session_id
        and s.profile_id = (select auth.uid())
    )
  );

create policy session_sets_update_self on public.session_sets
  for update to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_sets.session_id
        and s.profile_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.sessions s
      where s.id = session_sets.session_id
        and s.profile_id = (select auth.uid())
    )
  );

create policy session_sets_delete_self on public.session_sets
  for delete to authenticated
  using (
    exists (
      select 1 from public.sessions s
      where s.id = session_sets.session_id
        and s.profile_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 20261010090100_cm59_grants.sql
-- ---------------------------------------------------------------------------

-- CM-59 livraison A (« schéma ») : droits au plus juste.
--
-- Jusqu'ici : ALL (dont TRUNCATE, REFERENCES, TRIGGER) pour anon ET
-- authenticated sur les tables historiques (baseline, comme la prod). Après :
-- - anon : plus rien dans le schéma public (tables, séquences, fonctions) ;
-- - authenticated : uniquement ce que les policies de
--   20261010090000_cm59_rls_policies.sql encadrent :
--     profiles           select + update (display_name, weekly_goal, color_role)
--     duos, duo_members  select
--     exercises, programs, program_days, program_exercises, sessions,
--     session_sets       select, insert, update, delete
--     couples, couple_members, duo_invitations : rien
--   et EXECUTE seulement sur les 4 helpers RLS ;
-- - service_role : inchangé (l'app passe par elle, CM-17).
--
-- Les triggers (on_auth_user_created, programs_sync_duo, exercises_sync_duo,
-- couples_sync_duos, couple_members_sync_duo_members, duo_members_max_two)
-- continuent de fonctionner : PostgreSQL ne vérifie pas EXECUTE sur la
-- fonction d'un trigger quand il se déclenche (seulement à sa création).
-- Prouvé par supabase/tests/rls.test.sql (cas 11, 16 et 17).
--
-- Rejouable : revoke / grant sont idempotents.

-- 1. anon : plus rien ---------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2. authenticated : tables ---------------------------------------------------------

revoke truncate, references, trigger on all tables in schema public from authenticated;

-- PostgreSQL 17 (prod et CI) : MAINTAIN (vacuum, analyze, lock...) fait
-- partie de ALL. Retiré aussi ; conditionnel pour rester exécutable en 15/16.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from authenticated';
  end if;
end
$$;

-- profiles : lecture, et mise à jour des seules colonnes éditables. Le revoke
-- de UPDATE au niveau table retire aussi les droits colonne : il passe AVANT
-- le grant colonne.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, weekly_goal, color_role) on public.profiles to authenticated;

-- duos / duo_members : lecture seule. duo_invitations : rien.
revoke all on public.duos, public.duo_members, public.duo_invitations from authenticated;
grant select on public.duos, public.duo_members to authenticated;

grant select, insert, update, delete on
  public.exercises, public.programs, public.program_days,
  public.program_exercises, public.sessions, public.session_sets
  to authenticated;

-- Modèle couple : plus aucun accès hors service-role.
revoke all on public.couples, public.couple_members from authenticated;

-- 3. Fonctions ------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
-- Au-delà du cadrage : authenticated perd aussi EXECUTE partout (aucune RPC
-- n'est appelée par un client connecté) puis le récupère sur les 4 helpers.
revoke execute on all functions in schema public from authenticated;
grant execute on function
  public.my_duo_id(), public.is_duo_member(uuid),
  public.visible_profile_ids(), public.can_access_program(uuid)
  to authenticated;

-- 4. Privilèges par défaut (objets créés plus tard par le rôle courant) -------------
-- NB : pour les fonctions, EXECUTE à PUBLIC est un défaut GLOBAL de
-- PostgreSQL qu'un défaut par schéma ne peut pas retirer : chaque nouvelle
-- fonction doit toujours faire son `revoke ... from public` explicite.

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;

commit;

-- ---------------------------------------------------------------------------
-- Vérification (lecture seule). Dernière ligne : ok = true.
-- ---------------------------------------------------------------------------

select
  (select count(*) from pg_policies
    where schemaname = 'public'
      and (qual ilike '%couple%' or with_check ilike '%couple%')) = 0
  and (select count(*) from pg_policies where schemaname = 'public') = 22
  and not exists (select 1 from information_schema.role_table_grants
                  where table_schema = 'public' and grantee = 'anon')
  and not has_table_privilege('authenticated', 'public.sessions', 'TRUNCATE')
  and has_table_privilege('authenticated', 'public.duo_members', 'SELECT')
  and (select count(*) from public.sessions) >= 9
  as ok;

-- ============================================================================
-- RETOUR ARRIÈRE (à décommenter et coller seul, en cas de besoin).
-- Rétablit l'état d'avant CM-59 tel que décrit par le repo :
-- policies et fonctions de supabase/migrations/20260506000000_baseline.sql,
-- droits de la baseline (ALL pour anon / authenticated sur les 9 tables
-- historiques) et de 20261007090100_cm85_duos_expand.sql (rien pour anon /
-- authenticated sur duos, duo_members, duo_invitations).
-- Si la lecture de la prod a montré d'autres policies / droits, les ajouter.
-- ============================================================================
--
-- begin;
--
-- -- 1. Policies CM-59 (toutes celles des tables concernées).
-- do $$
-- declare r record;
-- begin
--   for r in select schemaname, tablename, policyname from pg_policies
--            where schemaname = 'public'
--              and tablename in ('profiles', 'couples', 'couple_members',
--                                'duos', 'duo_members', 'duo_invitations',
--                                'exercises', 'programs', 'program_days',
--                                'program_exercises', 'sessions', 'session_sets')
--   loop
--     execute format('drop policy if exists %I on %I.%I',
--                    r.policyname, r.schemaname, r.tablename);
--   end loop;
-- end $$;
--
-- alter table public.sessions alter column profile_id drop default;
--
-- -- 2. Helpers du modèle couple (corps de la baseline).
-- create or replace function public.user_couple_id()
--  returns uuid
--  language sql
--  stable security definer
--  set search_path to 'public'
-- as $function$
--   select couple_id from couple_members where profile_id = auth.uid() limit 1;
-- $function$;
--
-- create or replace function public.accessible_profile_ids()
--  returns setof uuid
--  language sql
--  stable security definer
--  set search_path to 'public'
-- as $function$
--   select auth.uid()
--   union
--   select cm2.profile_id
--   from couple_members cm1
--   join couple_members cm2 on cm1.couple_id = cm2.couple_id
--   where cm1.profile_id = auth.uid()
--     and cm2.profile_id != auth.uid();
-- $function$;
--
-- revoke all on function public.user_couple_id(), public.accessible_profile_ids()
--   from public, anon, authenticated;
-- grant execute on function public.user_couple_id(), public.accessible_profile_ids()
--   to authenticated, service_role;
--
-- -- 3. Policies de la baseline (22).
-- create policy profiles_select_self_or_partner on public.profiles
--   for select to authenticated
--   using (id in (select accessible_profile_ids() as accessible_profile_ids));
-- create policy profiles_update_self on public.profiles
--   for update to authenticated
--   using (id = auth.uid()) with check (id = auth.uid());
-- create policy couples_select_member on public.couples
--   for select to authenticated using (id = user_couple_id());
-- create policy couples_insert_when_not_in_couple on public.couples
--   for insert to authenticated
--   with check (not exists (select 1 from couple_members where couple_members.profile_id = auth.uid()));
-- create policy couple_members_select_self_or_couple on public.couple_members
--   for select to authenticated
--   using (profile_id = auth.uid() or couple_id = user_couple_id());
-- create policy couple_members_insert_self on public.couple_members
--   for insert to authenticated with check (profile_id = auth.uid());
-- create policy exercises_select_system_or_couple on public.exercises
--   for select to authenticated using (couple_id is null or couple_id = user_couple_id());
-- create policy exercises_insert_couple on public.exercises
--   for insert to authenticated with check (couple_id = user_couple_id());
-- create policy exercises_update_couple on public.exercises
--   for update to authenticated
--   using (couple_id = user_couple_id()) with check (couple_id = user_couple_id());
-- create policy exercises_delete_couple on public.exercises
--   for delete to authenticated using (couple_id = user_couple_id());
-- create policy programs_select on public.programs
--   for select to authenticated
--   using (owner_profile_id = auth.uid() or couple_id = user_couple_id());
-- create policy programs_insert on public.programs
--   for insert to authenticated
--   with check ((owner_profile_id = auth.uid() and couple_id is null)
--               or (couple_id = user_couple_id() and owner_profile_id is null));
-- create policy programs_update on public.programs
--   for update to authenticated
--   using (owner_profile_id = auth.uid() or couple_id = user_couple_id())
--   with check (owner_profile_id = auth.uid() or couple_id = user_couple_id());
-- create policy programs_delete on public.programs
--   for delete to authenticated
--   using (owner_profile_id = auth.uid() or couple_id = user_couple_id());
-- create policy program_days_all on public.program_days
--   for all to authenticated
--   using (program_id in (select programs.id from programs
--          where programs.owner_profile_id = auth.uid() or programs.couple_id = user_couple_id()))
--   with check (program_id in (select programs.id from programs
--          where programs.owner_profile_id = auth.uid() or programs.couple_id = user_couple_id()));
-- create policy program_exercises_all on public.program_exercises
--   for all to authenticated
--   using (program_day_id in (select pd.id from program_days pd join programs p on p.id = pd.program_id
--          where p.owner_profile_id = auth.uid() or p.couple_id = user_couple_id()))
--   with check (program_day_id in (select pd.id from program_days pd join programs p on p.id = pd.program_id
--          where p.owner_profile_id = auth.uid() or p.couple_id = user_couple_id()));
-- create policy sessions_select_self_or_partner on public.sessions
--   for select to authenticated
--   using (profile_id in (select accessible_profile_ids() as accessible_profile_ids));
-- create policy sessions_insert_self on public.sessions
--   for insert to authenticated with check (profile_id = auth.uid());
-- create policy sessions_update_self on public.sessions
--   for update to authenticated
--   using (profile_id = auth.uid()) with check (profile_id = auth.uid());
-- create policy sessions_delete_self on public.sessions
--   for delete to authenticated using (profile_id = auth.uid());
-- create policy session_sets_select on public.session_sets
--   for select to authenticated
--   using (session_id in (select sessions.id from sessions
--          where sessions.profile_id in (select accessible_profile_ids() as accessible_profile_ids)));
-- create policy session_sets_modify_self on public.session_sets
--   for all to authenticated
--   using (session_id in (select sessions.id from sessions where sessions.profile_id = auth.uid()))
--   with check (session_id in (select sessions.id from sessions where sessions.profile_id = auth.uid()));
--
-- -- 4. Droits d'origine.
-- grant all on table
--   public.profiles, public.couples, public.couple_members, public.exercises,
--   public.programs, public.program_days, public.program_exercises,
--   public.sessions, public.session_sets
--   to anon, authenticated;
-- revoke all on table public.duos, public.duo_members, public.duo_invitations
--   from anon, authenticated;
-- alter default privileges in schema public grant all on tables    to anon;
-- alter default privileges in schema public grant all on sequences to anon;
-- alter default privileges in schema public grant all on functions to anon;
-- -- Fonctions : la baseline et CM-85 retiraient déjà EXECUTE à public / anon
-- -- partout, et à authenticated hors helpers RLS : rien d'autre à rétablir.
--
-- commit;
