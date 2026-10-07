-- CM-85 partie A (« expand ») : le couple devient un duo, à côté de l'existant.
--
-- Ce que fait cette migration (cadrage CM-58 / CM-85, sections 3.1 et 3.4) :
-- 1. tables `duos`, `duo_members`, `duo_invitations` ;
--    - un profil dans un seul duo (index unique sur `duo_members.profile_id`) ;
--    - 2 membres max par duo (trigger `duo_members_max_two`) ;
-- 2. colonnes `duo_id` sur `programs` et `exercises` (là où il y a `couple_id`) ;
-- 3. rapatriement : le duo reprend l'uuid du couple (33333333-… en prod) et ses
--    membres ; `duo_id` = `couple_id` partout ;
-- 4. synchro pendant la transition :
--    - `programs` / `exercises` : `couple_id` ↔ `duo_id` dans les deux sens
--      (l'ancien code écrit `couple_id`, le nouveau écrit `duo_id`, la
--      contrainte `program_owner_xor` porte encore sur `couple_id`) ;
--    - `couples` / `couple_members` → `duos` / `duo_members` (plus rien
--      n'écrit les tables couple côté app, mais on reste cohérent si jamais) ;
-- 5. fonctions helper pour la RLS de CM-59 (`my_duo_id`, `is_duo_member`,
--    `visible_profile_ids`, `can_access_program`), sans policy pour l'instant.
--
-- Sécurité : RLS activée sur les nouvelles tables, aucune policy, aucun droit
-- pour `anon` ni `authenticated` (seule la service-role, utilisée par le
-- serveur, y accède). Les policies duo arrivent avec CM-59.
--
-- Rien n'est supprimé : `couples`, `couple_members` et `couple_id` restent en
-- place et à jour jusqu'à la partie B (contract).
--
-- Idempotente : `if not exists`, `create or replace`, triggers recréés,
-- rapatriement en `on conflict do nothing` / `where duo_id is null`.

-- 1. Tables -------------------------------------------------------------------

create table if not exists public.duos (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.duo_members (
  duo_id      uuid not null references public.duos (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  joined_at   timestamptz not null default now(),
  primary key (duo_id, profile_id)
);

-- Un profil n'appartient qu'à un seul duo.
create unique index if not exists duo_members_one_duo_per_user
  on public.duo_members (profile_id);

create table if not exists public.duo_invitations (
  id           uuid primary key default gen_random_uuid(),
  duo_id       uuid not null references public.duos (id) on delete cascade,
  created_by   uuid not null references public.profiles (id) on delete cascade,
  -- Code saisi à la main (CM-87).
  code         text not null check (code ~ '^[A-Z0-9]{6}$'),
  -- Pour un lien https://…/duo/rejoindre/<token> (CM-87).
  token        uuid not null default gen_random_uuid(),
  expires_at   timestamptz not null default now() + interval '7 days',
  accepted_by  uuid references public.profiles (id) on delete set null,
  accepted_at  timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists duo_invitations_token_key
  on public.duo_invitations (token);
create unique index if not exists duo_invitations_active_code
  on public.duo_invitations (code)
  where accepted_at is null and revoked_at is null;
create index if not exists duo_invitations_duo
  on public.duo_invitations (duo_id);

-- 2 membres max par duo. Verrou sur la ligne du duo : deux ajouts simultanés
-- dans le même duo passent l'un après l'autre (pas de 3e membre par course).
create or replace function public.duo_members_enforce_max()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_count int;
begin
  perform 1 from public.duos where id = new.duo_id for update;
  select count(*) into v_count
  from public.duo_members
  where duo_id = new.duo_id and profile_id <> new.profile_id;
  if v_count >= 2 then
    raise exception 'CM-85 : un duo compte au plus 2 membres (duo %)', new.duo_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger if exists duo_members_max_two on public.duo_members;
create trigger duo_members_max_two
  before insert or update of duo_id on public.duo_members
  for each row execute function public.duo_members_enforce_max();

-- 2. Colonnes duo_id ------------------------------------------------------------

alter table public.programs
  add column if not exists duo_id uuid references public.duos (id) on delete cascade;
create index if not exists idx_programs_duo on public.programs (duo_id);

alter table public.exercises
  add column if not exists duo_id uuid references public.duos (id) on delete cascade;
create index if not exists idx_exercises_duo on public.exercises (duo_id);

-- 3. Rapatriement (même uuid que le couple) ----------------------------------

insert into public.duos (id, name, created_at)
  select c.id, c.name, c.created_at from public.couples c
  on conflict (id) do nothing;

insert into public.duo_members (duo_id, profile_id, joined_at)
  select cm.couple_id, cm.profile_id, cm.joined_at from public.couple_members cm
  on conflict do nothing;

update public.programs  set duo_id = couple_id where couple_id is not null and duo_id is null;
update public.exercises set duo_id = couple_id where couple_id is not null and duo_id is null;

-- 4. Synchro pendant la transition -------------------------------------------

-- programs / exercises : couple_id ↔ duo_id. À l'insertion, la colonne
-- renseignée remplit l'autre ; à la mise à jour, la colonne modifiée gagne.
-- Les deux renseignées et différentes : refus (incohérence).
create or replace function public.sync_couple_duo_id()
 returns trigger
 language plpgsql
 set search_path to ''
as $function$
begin
  if tg_op = 'INSERT' then
    new.duo_id    := coalesce(new.duo_id, new.couple_id);
    new.couple_id := coalesce(new.couple_id, new.duo_id);
  elsif new.duo_id is distinct from old.duo_id
        and new.couple_id is not distinct from old.couple_id then
    new.couple_id := new.duo_id;
  elsif new.couple_id is distinct from old.couple_id
        and new.duo_id is not distinct from old.duo_id then
    new.duo_id := new.couple_id;
  end if;
  if new.duo_id is distinct from new.couple_id then
    raise exception 'CM-85 : duo_id (%) et couple_id (%) divergent sur %',
      new.duo_id, new.couple_id, tg_table_name
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

drop trigger if exists programs_sync_duo on public.programs;
create trigger programs_sync_duo
  before insert or update on public.programs
  for each row execute function public.sync_couple_duo_id();

drop trigger if exists exercises_sync_duo on public.exercises;
create trigger exercises_sync_duo
  before insert or update on public.exercises
  for each row execute function public.sync_couple_duo_id();

-- couples → duos (même id, même nom). La suppression d'un couple supprime le
-- duo (les cascades font le reste, comme aujourd'hui côté couple).
create or replace function public.sync_couples_to_duos()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op = 'DELETE' then
    delete from public.duos where id = old.id;
    return old;
  end if;
  insert into public.duos (id, name, created_at)
    values (new.id, new.name, new.created_at)
    on conflict (id) do update set name = excluded.name;
  return new;
end;
$function$;

drop trigger if exists couples_sync_duos on public.couples;
create trigger couples_sync_duos
  after insert or update or delete on public.couples
  for each row execute function public.sync_couples_to_duos();

-- couple_members → duo_members.
create or replace function public.sync_couple_members_to_duo_members()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    delete from public.duo_members
      where duo_id = old.couple_id and profile_id = old.profile_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    insert into public.duo_members (duo_id, profile_id, joined_at)
      values (new.couple_id, new.profile_id, new.joined_at)
      on conflict (duo_id, profile_id) do nothing;
    return new;
  end if;
  return old;
end;
$function$;

drop trigger if exists couple_members_sync_duo_members on public.couple_members;
create trigger couple_members_sync_duo_members
  after insert or update or delete on public.couple_members
  for each row execute function public.sync_couple_members_to_duo_members();

-- 5. Fonctions helper (RLS de CM-59) -------------------------------------------

-- Duo de l'utilisateur connecté (null si aucun).
create or replace function public.my_duo_id()
 returns uuid
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select duo_id from public.duo_members where profile_id = (select auth.uid())
$function$;

-- L'utilisateur connecté est-il membre de ce duo ?
create or replace function public.is_duo_member(p_duo_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.duo_members
    where duo_id = p_duo_id and profile_id = (select auth.uid())
  )
$function$;

-- Remplace accessible_profile_ids() : moi + mon partenaire de duo.
create or replace function public.visible_profile_ids()
 returns setof uuid
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select (select auth.uid())
  union
  select m2.profile_id
  from public.duo_members m1
  join public.duo_members m2 on m2.duo_id = m1.duo_id
  where m1.profile_id = (select auth.uid())
$function$;

-- Programme accessible : propriétaire, ou membre du duo du programme.
create or replace function public.can_access_program(p_program_id uuid)
 returns boolean
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select exists (
    select 1 from public.programs p
    where p.id = p_program_id
      and (p.owner_profile_id = (select auth.uid())
           or (p.duo_id is not null and public.is_duo_member(p.duo_id)))
  )
$function$;

-- 6. Droits -------------------------------------------------------------------

alter table public.duos            enable row level security;
alter table public.duo_members     enable row level security;
alter table public.duo_invitations enable row level security;

-- Supabase accorde par défaut tous les droits à anon / authenticated sur les
-- nouvelles tables : on les retire (policies et grants fins avec CM-59).
revoke all on table public.duos, public.duo_members, public.duo_invitations
  from public, anon, authenticated;
grant all on table public.duos, public.duo_members, public.duo_invitations
  to service_role;

-- Fonctions de trigger : jamais appelables directement.
revoke all on function public.duo_members_enforce_max(),
  public.sync_couple_duo_id(),
  public.sync_couples_to_duos(),
  public.sync_couple_members_to_duo_members()
  from public, anon, authenticated;

-- Helpers RLS : utilisateurs connectés (et service-role), jamais anon.
revoke all on function public.my_duo_id(), public.is_duo_member(uuid),
  public.visible_profile_ids(), public.can_access_program(uuid)
  from public, anon;
grant execute on function public.my_duo_id(), public.is_duo_member(uuid),
  public.visible_profile_ids(), public.can_access_program(uuid)
  to authenticated, service_role;
