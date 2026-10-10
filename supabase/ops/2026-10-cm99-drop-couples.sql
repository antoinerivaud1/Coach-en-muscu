-- ============================================================================
-- CM-99 (CM-85 partie B) : fichier UNIQUE à coller dans Supabase, SQL Editor
-- (PROD, projet coach-en-muscu). Mode d'emploi : supabase/ops/2026-10-cm99-drop-couples.md.
--
-- Contenu = la migration du repo, À L'IDENTIQUE, dans une transaction :
--   supabase/migrations/20261010120000_cm99_drop_couples.sql
-- Si une instruction échoue, rien n'est appliqué (rollback automatique).
-- Rejouable : relancer le fichier sur une base déjà migrée ne change rien.
--
-- AVANT de lancer : aucune séance en cours. Cette requête doit renvoyer 0
-- (sinon attendre la fin de la séance) :
--   select count(*) from public.sessions where duration_seconds is null;
--
-- La dernière requête renvoie UNE ligne : `ok` (dernière colonne) doit valoir
-- true. Les colonnes précédentes disent quel contrôle a échoué le cas échéant.
-- À appliquer AVANT de merger la PR.
--
-- Retour arrière : bloc commenté en bas du fichier.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 20261010120000_cm99_drop_couples.sql
-- ---------------------------------------------------------------------------

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

commit;

-- ---------------------------------------------------------------------------
-- Vérification (lecture seule). Une ligne, dernière colonne `ok` = true.
-- ---------------------------------------------------------------------------

with v as (
  select
    -- Plus aucune table, colonne ni fonction %couple% dans public.
    not exists (select 1 from information_schema.tables
                where table_schema = 'public' and table_name ilike '%couple%')
      as pas_de_table_couple,
    not exists (select 1 from information_schema.columns
                where table_schema = 'public' and column_name ilike '%couple%')
      as pas_de_colonne_couple,
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.proname ilike '%couple%')
      as pas_de_fonction_couple,
    -- XOR owner_profile_id / duo_id présent et validé, ancien XOR parti.
    exists (select 1 from pg_constraint
            where conrelid = 'public.programs'::regclass
              and conname = 'programs_owner_xor_duo'
              and contype = 'c' and convalidated)
    and not exists (select 1 from pg_constraint
                    where conrelid = 'public.programs'::regclass
                      and conname = 'program_owner_xor')
      as xor_duo_valide,
    not exists (select 1 from public.programs
                where (owner_profile_id is null) = (duo_id is null))
      as programmes_conformes,
    -- Garde-fous conservés.
    exists (select 1 from pg_trigger
            where tgname = 'duo_members_max_two'
              and tgrelid = 'public.duo_members'::regclass)
    and exists (select 1 from pg_trigger
                where tgname = 'on_auth_user_created'
                  and tgrelid = 'auth.users'::regclass)
      as triggers_conserves,
    -- Policies CM-59 intactes.
    (select count(*) from pg_policies where schemaname = 'public') = 22
      as policies_22,
    -- Données intactes (comptages au 10/10/2026 : 10, 190, 1, 81).
    (select count(*) from public.sessions)     >= 10
    and (select count(*) from public.session_sets) >= 190
    and (select count(*) from public.programs)     >= 1
    and (select count(*) from public.exercises)    >= 81
      as donnees_intactes
)
select
  *,
  (pas_de_table_couple and pas_de_colonne_couple and pas_de_fonction_couple
   and xor_duo_valide and programmes_conformes and triggers_conserves
   and policies_22 and donnees_intactes) as ok
from v;

-- ============================================================================
-- RETOUR ARRIÈRE (à décommenter et coller seul, en cas de besoin).
--
-- À savoir, honnêtement :
-- - La suppression est IRRÉVERSIBLE sans sauvegarde : les tables couples /
--   couple_members et les colonnes couple_id disparaissent avec leur contenu.
-- - Rien n'est perdu pour autant : ce contenu est redondant avec duos /
--   duo_members / duo_id (même uuid, recopié et synchronisé depuis CM-85 A).
-- - Le code de main d'avant CM-99 ne lit déjà plus le modèle couple : un retour
--   arrière du code (re-promouvoir l'ancien déploiement Vercel) ne demande PAS
--   ce SQL. Il ne sert que si l'on devait revenir à un code plus ancien encore
--   qui lirait couples / couple_id.
--
-- Le bloc ci-dessous recrée les structures (vides), puis les remplit depuis
-- les duos. La contrainte programs_owner_xor_duo reste en place ; les
-- triggers de synchro de CM-85 A ne sont pas recréés (les recopier depuis
-- supabase/migrations/20261007090100_cm85_duos_expand.sql si besoin).
-- ============================================================================
--
-- begin;
--
-- create table if not exists public.couples (
--   id uuid not null default gen_random_uuid(),
--   name text,
--   created_at timestamptz not null default now(),
--   constraint couples_pkey primary key (id)
-- );
--
-- create table if not exists public.couple_members (
--   couple_id uuid not null,
--   profile_id uuid not null,
--   joined_at timestamptz not null default now(),
--   constraint couple_members_pkey primary key (couple_id, profile_id),
--   constraint couple_members_couple_id_fkey foreign key (couple_id)
--     references public.couples (id) on delete cascade,
--   constraint couple_members_profile_id_fkey foreign key (profile_id)
--     references public.profiles (id) on delete cascade
-- );
-- create index if not exists idx_couple_members_profile
--   on public.couple_members (profile_id);
--
-- alter table public.couples        enable row level security;
-- alter table public.couple_members enable row level security;
-- revoke all on public.couples, public.couple_members from anon, authenticated;
-- grant all on public.couples, public.couple_members to service_role;
--
-- alter table public.exercises
--   add column if not exists couple_id uuid
--   constraint exercises_couple_id_fkey references public.couples (id) on delete cascade;
-- alter table public.programs
--   add column if not exists couple_id uuid
--   constraint programs_couple_id_fkey references public.couples (id) on delete cascade;
-- create index if not exists idx_exercises_couple on public.exercises (couple_id);
-- create index if not exists idx_programs_couple  on public.programs  (couple_id);
--
-- -- Remplissage depuis les duos (même uuid).
-- insert into public.couples (id, name, created_at)
--   select id, name, created_at from public.duos on conflict (id) do nothing;
-- insert into public.couple_members (couple_id, profile_id, joined_at)
--   select duo_id, profile_id, joined_at from public.duo_members on conflict do nothing;
-- update public.programs  set couple_id = duo_id where duo_id is not null;
-- update public.exercises set couple_id = duo_id where duo_id is not null;
--
-- commit;
--
-- Puis, si le migration repair a été fait :
--   npx supabase migration repair --status reverted 20261010120000
