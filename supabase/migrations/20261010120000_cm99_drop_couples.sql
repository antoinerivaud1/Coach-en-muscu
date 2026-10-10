-- CM-99 (CM-85 partie B, « contract ») : fin du modèle couple.
--
-- Depuis CM-85 partie A, le duo porte tout : `duos` / `duo_members` (même
-- uuid que l'ancien couple) et `duo_id` sur `programs` / `exercises`, tenu égal
-- à `couple_id` par des triggers de synchro. Depuis CM-59 A, aucune policy ne
-- lit plus le modèle couple. Le code n'écrit plus que `duo_id`.
--
-- Ce que fait cette migration, dans cet ordre :
-- 1. contrainte XOR `programs_owner_xor_duo` (owner_profile_id XOR duo_id),
--    posée AVANT de retirer `program_owner_xor` (qui porte sur couple_id) :
--    un programme est toujours soit perso, soit partagé, sans trou ;
-- 2. suppression des triggers de synchro couple / duo ;
-- 3. suppression de `exercises.couple_id` et `programs.couple_id` (FK et
--    index compris) ;
-- 4. suppression des tables `couple_members` puis `couples` ;
-- 5. suppression des fonctions du modèle couple.
--
-- Conservés : `duo_members_max_two` (2 membres max par duo), le trigger
-- `on_auth_user_created` (handle_new_user), les 22 policies CM-59, les
-- grants CM-59. Index `idx_programs_duo` / `idx_exercises_duo` : déjà créés
-- par CM-85 partie A, réaffirmés ici (`if not exists`).
--
-- Aucune donnée perdue : tout ce que portaient couples / couple_members /
-- couple_id est déjà dans duos / duo_members / duo_id (même uuid, recopié et
-- synchronisé par CM-85 A). Garde-fou en tête : la migration échoue AVANT
-- tout changement si une ligne a un couple_id sans duo_id égal.
--
-- Pas de `cascade` : si un objet inattendu (vue, policy, fonction SQL)
-- dépendait encore du modèle couple, la migration échouerait au lieu de le
-- supprimer en silence.
--
-- Rejouable : `if exists` / `if not exists` partout, contrainte créée
-- seulement si absente.

-- 0. Garde-fou : duo_id doit déjà porter tout ce que porte couple_id ------------

do $$
declare
  v_n bigint := 0;
  v_m bigint;
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'programs'
               and column_name = 'couple_id') then
    execute 'select count(*) from public.programs
             where couple_id is not null and duo_id is distinct from couple_id'
      into v_m;
    v_n := v_n + v_m;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'exercises'
               and column_name = 'couple_id') then
    execute 'select count(*) from public.exercises
             where couple_id is not null and duo_id is distinct from couple_id'
      into v_m;
    v_n := v_n + v_m;
  end if;
  if v_n > 0 then
    raise exception 'CM-99 : % ligne(s) avec un couple_id non recopié dans duo_id. Rien n''a été supprimé.', v_n;
  end if;
end $$;

-- 1. XOR sur duo_id, avant de retirer l'ancien XOR sur couple_id ----------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.programs'::regclass
      and conname = 'programs_owner_xor_duo'
  ) then
    alter table public.programs
      add constraint programs_owner_xor_duo check (
        (owner_profile_id is not null and duo_id is null)
        or (owner_profile_id is null and duo_id is not null)
      ) not valid;
  end if;
end $$;

-- Vérifie les lignes existantes (sans effet si déjà validée).
alter table public.programs validate constraint programs_owner_xor_duo;

alter table public.programs drop constraint if exists program_owner_xor;

-- 2. Triggers de synchro couple / duo ---------------------------------------------

drop trigger if exists programs_sync_duo  on public.programs;
drop trigger if exists exercises_sync_duo on public.exercises;
drop trigger if exists couples_sync_duos               on public.couples;
drop trigger if exists couple_members_sync_duo_members on public.couple_members;

-- 3. Colonnes couple_id ------------------------------------------------------------

drop index if exists public.idx_programs_couple;
drop index if exists public.idx_exercises_couple;
alter table public.programs  drop constraint if exists programs_couple_id_fkey;
alter table public.exercises drop constraint if exists exercises_couple_id_fkey;
alter table public.programs  drop column if exists couple_id;
alter table public.exercises drop column if exists couple_id;

create index if not exists idx_programs_duo  on public.programs  (duo_id);
create index if not exists idx_exercises_duo on public.exercises (duo_id);

-- 4. Tables couple_members puis couples -------------------------------------------

drop table if exists public.couple_members;
drop table if exists public.couples;

-- 5. Fonctions du modèle couple ----------------------------------------------------
-- user_couple_id / accessible_profile_ids : déjà supprimées par CM-59 A,
-- gardées ici pour une base qui ne l'aurait pas été.

drop function if exists public.sync_couple_duo_id();
drop function if exists public.sync_couples_to_duos();
drop function if exists public.sync_couple_members_to_duo_members();
drop function if exists public.create_couple(text);
drop function if exists public.join_couple(uuid);
drop function if exists public.user_couple_id();
drop function if exists public.accessible_profile_ids();
