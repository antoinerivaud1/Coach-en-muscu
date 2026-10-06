-- ============================================================================
-- CM-85 PR 0 : BASELINE du schéma `public`
-- ============================================================================
--
-- Généré par introspection de la prod (projet drmmgwchoowggpsppilo) le
-- 06/10/2026 : pg_catalog, pg_get_constraintdef, pg_get_indexdef,
-- pg_get_functiondef, pg_get_triggerdef, pg_policies, ACL des tables et
-- fonctions, et historique supabase_migrations.schema_migrations.
--
-- Cette migration remplace les 12 premières migrations appliquées en prod via
-- le dashboard / MCP et jamais committées (init_schema_tables ...
-- add_weekdays_to_program_days, du 06/05/2026 au 21/06/2026). Elle reproduit
-- l'état de la prod AVANT les deux deltas déjà présents dans ce dossier :
--
--   - `program_days.weekdays` est PRÉSENTE ici (supprimée ensuite par
--     20260812072300_drop_program_days_weekdays.sql, CM-69) ;
--   - l'index unique `session_sets_session_exercise_set_key` est ABSENT ici
--     (créé ensuite par 20260912093000_session_sets_unique_set.sql, CM-78).
--
-- baseline + ces deux fichiers, appliqués dans l'ordre = schéma prod actuel.
--
-- NE PAS REJOUER SUR LA PROD. Elle sert uniquement aux bases neuves
-- (`supabase db reset` en local / CI). Le garde-fou ci-dessous la fait échouer
-- si le schéma existe déjà.
--
-- Hors périmètre (gérés par la plateforme Supabase, déjà présents sur toute
-- base Supabase) : schémas auth/storage/vault, extensions pg_stat_statements
-- et supabase_vault, privilèges par défaut du schéma public.
-- ============================================================================

do $$
begin
  if to_regclass('public.profiles') is not null then
    raise exception 'Baseline CM-85 : le schéma public existe déjà. Cette migration ne doit jamais être rejouée sur une base existante (prod).';
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- Extensions (présentes en prod dans le schéma `extensions`)
-- `gen_random_uuid()` est natif depuis PG 13 ; pgcrypto et uuid-ossp sont
-- installés mais aucune colonne/fonction du schéma public n'en dépend.
-- ----------------------------------------------------------------------------

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- ----------------------------------------------------------------------------
-- Types enum
-- ----------------------------------------------------------------------------

create type public.color_role as enum ('toi', 'elle');

create type public.muscle_group as enum (
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'core', 'other'
);

create type public.session_feedback as enum ('easy', 'normal', 'hard', 'failure');

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- Plus de FK vers auth.users depuis 20260613 (no_auth_profiles_and_open_rls) :
-- les profils sont fixes et choisis par cookie, l'id a un default.
create table public.profiles (
  id uuid not null default gen_random_uuid(),
  display_name text not null,
  color_role public.color_role not null default 'toi'::public.color_role,
  created_at timestamptz not null default now(),
  weekly_goal integer not null default 4,
  constraint profiles_pkey primary key (id),
  constraint profiles_weekly_goal_range check (weekly_goal >= 1 and weekly_goal <= 14)
);

create table public.couples (
  id uuid not null default gen_random_uuid(),
  name text,
  created_at timestamptz not null default now(),
  constraint couples_pkey primary key (id)
);

create table public.couple_members (
  couple_id uuid not null,
  profile_id uuid not null,
  joined_at timestamptz not null default now(),
  constraint couple_members_pkey primary key (couple_id, profile_id),
  constraint couple_members_couple_id_fkey foreign key (couple_id)
    references public.couples (id) on delete cascade,
  constraint couple_members_profile_id_fkey foreign key (profile_id)
    references public.profiles (id) on delete cascade
);

-- couple_id NULL = exercice système (catalogue commun)
create table public.exercises (
  id uuid not null default gen_random_uuid(),
  name text not null,
  muscle_group public.muscle_group not null,
  is_compound boolean not null default false,
  couple_id uuid,
  created_at timestamptz not null default now(),
  constraint exercises_pkey primary key (id),
  constraint exercises_couple_id_fkey foreign key (couple_id)
    references public.couples (id) on delete cascade
);

create table public.programs (
  id uuid not null default gen_random_uuid(),
  name text not null,
  owner_profile_id uuid,
  couple_id uuid,
  created_at timestamptz not null default now(),
  constraint programs_pkey primary key (id),
  constraint programs_owner_profile_id_fkey foreign key (owner_profile_id)
    references public.profiles (id) on delete cascade,
  constraint programs_couple_id_fkey foreign key (couple_id)
    references public.couples (id) on delete cascade,
  -- XOR : soit individuel (owner_profile_id), soit partagé (couple_id)
  constraint program_owner_xor check (
    (owner_profile_id is not null and couple_id is null)
    or (owner_profile_id is null and couple_id is not null)
  )
);

-- `weekdays` : état d'avant CM-69 (voir en-tête), supprimée par la migration
-- 20260812072300_drop_program_days_weekdays.sql.
create table public.program_days (
  id uuid not null default gen_random_uuid(),
  program_id uuid not null,
  name text not null,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  weekdays smallint[] not null default '{}',
  constraint program_days_pkey primary key (id),
  constraint program_days_program_id_fkey foreign key (program_id)
    references public.programs (id) on delete cascade,
  constraint program_days_weekdays_range check (weekdays <@ array[0,1,2,3,4,5,6]::smallint[])
);

create table public.program_exercises (
  id uuid not null default gen_random_uuid(),
  program_day_id uuid not null,
  exercise_id uuid not null,
  order_index integer not null default 0,
  target_sets integer not null default 3,
  target_reps_min integer not null default 8,
  target_reps_max integer not null default 12,
  rest_seconds integer not null default 90,
  notes text,
  created_at timestamptz not null default now(),
  constraint program_exercises_pkey primary key (id),
  constraint program_exercises_program_day_id_fkey foreign key (program_day_id)
    references public.program_days (id) on delete cascade,
  constraint program_exercises_exercise_id_fkey foreign key (exercise_id)
    references public.exercises (id) on delete restrict,
  constraint program_exercises_target_sets_check check (target_sets > 0),
  constraint program_exercises_target_reps_min_check check (target_reps_min > 0),
  constraint program_exercises_check check (target_reps_max >= target_reps_min),
  constraint program_exercises_rest_seconds_check check (rest_seconds >= 0)
);

-- duration_seconds : null = séance en cours, renseigné = terminée (CM-83)
create table public.sessions (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  program_day_id uuid,
  performed_at timestamptz not null default now(),
  feedback public.session_feedback,
  notes text,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  constraint sessions_pkey primary key (id),
  constraint sessions_profile_id_fkey foreign key (profile_id)
    references public.profiles (id) on delete cascade,
  constraint sessions_program_day_id_fkey foreign key (program_day_id)
    references public.program_days (id) on delete set null,
  constraint sessions_duration_seconds_check check (duration_seconds is null or duration_seconds >= 0)
);

create table public.session_sets (
  id uuid not null default gen_random_uuid(),
  session_id uuid not null,
  exercise_id uuid not null,
  set_index integer not null,
  weight_kg numeric(6,2) not null,
  reps integer not null,
  rpe integer,
  is_warmup boolean not null default false,
  created_at timestamptz not null default now(),
  constraint session_sets_pkey primary key (id),
  constraint session_sets_session_id_fkey foreign key (session_id)
    references public.sessions (id) on delete cascade,
  constraint session_sets_exercise_id_fkey foreign key (exercise_id)
    references public.exercises (id) on delete restrict,
  constraint session_sets_set_index_check check (set_index > 0),
  constraint session_sets_weight_kg_check check (weight_kg >= 0::numeric),
  constraint session_sets_reps_check check (reps >= 0),
  constraint session_sets_rpe_check check (rpe is null or (rpe >= 1 and rpe <= 10))
);

-- ----------------------------------------------------------------------------
-- Index (hors PK). L'index unique session_sets_session_exercise_set_key vient
-- de 20260912093000_session_sets_unique_set.sql.
-- ----------------------------------------------------------------------------

create index idx_couple_members_profile on public.couple_members using btree (profile_id);
create index idx_exercises_couple on public.exercises using btree (couple_id);
create index idx_programs_owner on public.programs using btree (owner_profile_id);
create index idx_programs_couple on public.programs using btree (couple_id);
create index idx_program_days_program on public.program_days using btree (program_id);
create index idx_program_exercises_day on public.program_exercises using btree (program_day_id);
create index idx_sessions_profile_perf on public.sessions using btree (profile_id, performed_at desc);
create index idx_session_sets_session on public.session_sets using btree (session_id);
create index idx_session_sets_exercise on public.session_sets using btree (exercise_id);

-- ----------------------------------------------------------------------------
-- Fonctions (corps identiques à pg_get_functiondef en prod)
-- ----------------------------------------------------------------------------

create or replace function public.user_couple_id()
 returns uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select couple_id from couple_members where profile_id = auth.uid() limit 1;
$function$;

create or replace function public.accessible_profile_ids()
 returns setof uuid
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select auth.uid()
  union
  select cm2.profile_id
  from couple_members cm1
  join couple_members cm2 on cm1.couple_id = cm2.couple_id
  where cm1.profile_id = auth.uid()
    and cm2.profile_id != auth.uid();
$function$;

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, display_name, color_role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data->>'color_role')::color_role, 'toi')
  );
  return new;
end;
$function$;

-- RPC vestiges de l'onboarding (EXECUTE retiré à anon/authenticated, CM-17).
create or replace function public.create_couple(couple_name text default null::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  current_user_id uuid := auth.uid();
  new_couple_id uuid;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if exists (select 1 from couple_members where profile_id = current_user_id) then
    raise exception 'User is already in a couple';
  end if;

  insert into couples (name) values (couple_name) returning id into new_couple_id;
  insert into couple_members (couple_id, profile_id) values (new_couple_id, current_user_id);

  return new_couple_id;
end;
$function$;

create or replace function public.join_couple(target_couple_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  current_user_id uuid := auth.uid();
  member_count int;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (select 1 from couples where id = target_couple_id) then
    raise exception 'Couple not found';
  end if;

  if exists (select 1 from couple_members where profile_id = current_user_id) then
    raise exception 'User is already in a couple';
  end if;

  select count(*) into member_count from couple_members where couple_id = target_couple_id;
  if member_count >= 2 then
    raise exception 'Couple is full';
  end if;

  insert into couple_members (couple_id, profile_id) values (target_couple_id, current_user_id);

  return target_couple_id;
end;
$function$;

-- ----------------------------------------------------------------------------
-- Trigger sur auth.users (toujours actif en prod, bien que profiles ne
-- référence plus auth.users : un signup créerait un profil orphelin).
-- ----------------------------------------------------------------------------

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- RLS : activée partout. L'app passe par service_role (bypass RLS, CM-17) ;
-- les policies ci-dessous supposent auth.uid() = profiles.id.
-- ----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.exercises enable row level security;
alter table public.programs enable row level security;
alter table public.program_days enable row level security;
alter table public.program_exercises enable row level security;
alter table public.sessions enable row level security;
alter table public.session_sets enable row level security;

-- profiles
create policy profiles_select_self_or_partner on public.profiles
  for select to authenticated
  using (id in (select accessible_profile_ids() as accessible_profile_ids));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- couples
create policy couples_select_member on public.couples
  for select to authenticated
  using (id = user_couple_id());

create policy couples_insert_when_not_in_couple on public.couples
  for insert to authenticated
  with check (not exists (select 1 from couple_members where couple_members.profile_id = auth.uid()));

-- couple_members
create policy couple_members_select_self_or_couple on public.couple_members
  for select to authenticated
  using (profile_id = auth.uid() or couple_id = user_couple_id());

create policy couple_members_insert_self on public.couple_members
  for insert to authenticated
  with check (profile_id = auth.uid());

-- exercises
create policy exercises_select_system_or_couple on public.exercises
  for select to authenticated
  using (couple_id is null or couple_id = user_couple_id());

create policy exercises_insert_couple on public.exercises
  for insert to authenticated
  with check (couple_id = user_couple_id());

create policy exercises_update_couple on public.exercises
  for update to authenticated
  using (couple_id = user_couple_id())
  with check (couple_id = user_couple_id());

create policy exercises_delete_couple on public.exercises
  for delete to authenticated
  using (couple_id = user_couple_id());

-- programs
create policy programs_select on public.programs
  for select to authenticated
  using (owner_profile_id = auth.uid() or couple_id = user_couple_id());

create policy programs_insert on public.programs
  for insert to authenticated
  with check (
    (owner_profile_id = auth.uid() and couple_id is null)
    or (couple_id = user_couple_id() and owner_profile_id is null)
  );

create policy programs_update on public.programs
  for update to authenticated
  using (owner_profile_id = auth.uid() or couple_id = user_couple_id())
  with check (owner_profile_id = auth.uid() or couple_id = user_couple_id());

create policy programs_delete on public.programs
  for delete to authenticated
  using (owner_profile_id = auth.uid() or couple_id = user_couple_id());

-- program_days
create policy program_days_all on public.program_days
  for all to authenticated
  using (program_id in (
    select programs.id from programs
    where programs.owner_profile_id = auth.uid() or programs.couple_id = user_couple_id()
  ))
  with check (program_id in (
    select programs.id from programs
    where programs.owner_profile_id = auth.uid() or programs.couple_id = user_couple_id()
  ));

-- program_exercises
create policy program_exercises_all on public.program_exercises
  for all to authenticated
  using (program_day_id in (
    select pd.id from program_days pd
    join programs p on p.id = pd.program_id
    where p.owner_profile_id = auth.uid() or p.couple_id = user_couple_id()
  ))
  with check (program_day_id in (
    select pd.id from program_days pd
    join programs p on p.id = pd.program_id
    where p.owner_profile_id = auth.uid() or p.couple_id = user_couple_id()
  ));

-- sessions
create policy sessions_select_self_or_partner on public.sessions
  for select to authenticated
  using (profile_id in (select accessible_profile_ids() as accessible_profile_ids));

create policy sessions_insert_self on public.sessions
  for insert to authenticated
  with check (profile_id = auth.uid());

create policy sessions_update_self on public.sessions
  for update to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

create policy sessions_delete_self on public.sessions
  for delete to authenticated
  using (profile_id = auth.uid());

-- session_sets
create policy session_sets_select on public.session_sets
  for select to authenticated
  using (session_id in (
    select sessions.id from sessions
    where sessions.profile_id in (select accessible_profile_ids() as accessible_profile_ids)
  ));

create policy session_sets_modify_self on public.session_sets
  for all to authenticated
  using (session_id in (select sessions.id from sessions where sessions.profile_id = auth.uid()))
  with check (session_id in (select sessions.id from sessions where sessions.profile_id = auth.uid()));

-- ----------------------------------------------------------------------------
-- Grants (explicites pour ne pas dépendre des privilèges par défaut)
-- Tables : ALL (arwdDxtm) pour anon, authenticated, service_role, comme en prod.
-- Fonctions : PUBLIC/anon retirés ; authenticated n'a EXECUTE que sur les deux
-- helpers RLS ; service_role a EXECUTE partout.
-- ----------------------------------------------------------------------------

grant usage on schema public to anon, authenticated, service_role;

grant all on table
  public.profiles, public.couples, public.couple_members, public.exercises,
  public.programs, public.program_days, public.program_exercises,
  public.sessions, public.session_sets
  to anon, authenticated, service_role;

revoke all on function
  public.user_couple_id(), public.accessible_profile_ids(), public.handle_new_user(),
  public.create_couple(text), public.join_couple(uuid)
  from public, anon, authenticated;

grant execute on function
  public.user_couple_id(), public.accessible_profile_ids(), public.handle_new_user(),
  public.create_couple(text), public.join_couple(uuid)
  to service_role;

grant execute on function public.user_couple_id(), public.accessible_profile_ids()
  to authenticated;
