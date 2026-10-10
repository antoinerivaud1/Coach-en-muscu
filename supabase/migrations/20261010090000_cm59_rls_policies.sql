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
