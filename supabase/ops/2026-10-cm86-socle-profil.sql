-- ============================================================================
-- CM-86 / CM-87 socle : fichier UNIQUE à coller dans Supabase, SQL Editor
-- (PROD, projet coach-en-muscu).
--
-- Contenu = la migration du repo, À L'IDENTIQUE, dans une transaction :
--   supabase/migrations/20261010180000_cm86_socle_profil.sql
-- Si une instruction échoue, rien n'est appliqué (rollback automatique).
-- Rejouable : relancer le fichier sur une base déjà migrée ne change rien
-- (les remplissages accent_color / onboarded_at ne se font qu'à la création
-- des colonnes).
--
-- Sans interruption : l'app actuelle ne lit aucune des nouvelles colonnes, et
-- les 4 policies d'exercises réécrites donnent les mêmes droits qu'avant tant
-- qu'aucun exercice n'a de owner_profile_id.
--
-- La dernière requête renvoie UNE ligne : `ok` (dernière colonne) doit valoir
-- true. Les colonnes précédentes disent quel contrôle a échoué le cas échéant.
-- À appliquer AVANT de merger la PR.
--
-- Retour arrière : bloc commenté en bas du fichier.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 20261010180000_cm86_socle_profil.sql
-- ---------------------------------------------------------------------------

-- CM-86 / CM-87 : socle de schéma commun (onboarding solo, duo optionnel).
--
-- Décisions d'Antoine (maquettes validées le 07/10/2026) :
-- - couleur de membre parmi 6 (cyan, rose, orange, violet, bleu, jaune), qui
--   remplace color_role 'toi' / 'elle' ;
-- - avatar facultatif ;
-- - objectif hebdo de 1 à 7 séances, 3 par défaut à l'onboarding ;
-- - un utilisateur solo a ses propres exercices perso
--   (exercises.owner_profile_id).
--
-- Ce que fait cette migration :
-- 1. profiles.accent_color (6 valeurs, défaut cyan), rempli depuis color_role
--    à la création de la colonne ('elle' -> rose, sinon cyan). color_role est
--    CONSERVÉE (le code existant la lit encore ; retrait dans un ticket à
--    part) mais le nouveau code ne s'en sert plus (lib/members.ts) ;
-- 2. profiles.avatar_url (URL ou clé de stockage, facultatif ; pas de bucket
--    Storage ici) ;
-- 3. profiles.onboarded_at, rempli à now() pour les profils existants à la
--    création de la colonne (Antoine et Léa ne repassent pas par
--    l'onboarding) ; les futurs inscrits ont null ;
-- 4. weekly_goal entre 1 et 7 (au lieu de 1 à 14), défaut 3 ;
-- 5. grants : authenticated peut mettre à jour les nouvelles colonnes de son
--    profil ;
-- 6. exercises.owner_profile_id (exercice perso d'un utilisateur), jamais en
--    même temps que duo_id ; les 4 policies d'exercises sont réécrites (le
--    total reste à 22 policies dans public).
--
-- Inerte pour l'app actuelle : aucune ligne n'a owner_profile_id, et les
-- policies réécrites donnent exactement les mêmes droits qu'avant tant que
-- c'est le cas.
--
-- Rejouable : `if not exists` partout ; les remplissages (accent_color,
-- onboarded_at) ne se font QUE lorsque la colonne vient d'être créée, pour
-- qu'un second passage n'écrase ni une couleur choisie ensuite, ni ne marque
-- comme « onboardé » un compte inscrit entre-temps ; contraintes supprimées
-- puis recréées ; policies supprimées puis recréées.

-- 1. profiles.accent_color ------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'accent_color'
  ) then
    alter table public.profiles
      add column accent_color text not null default '#2FE6FF';
    update public.profiles
      set accent_color = case when color_role = 'elle' then '#FF4F7E'
                              else '#2FE6FF' end;
  end if;
end $$;

alter table public.profiles drop constraint if exists profiles_accent_color_palette;
alter table public.profiles
  add constraint profiles_accent_color_palette check (
    accent_color in ('#2FE6FF', '#FF4F7E', '#FF8A3D', '#A78BFA', '#5B8CFF', '#FFD23F')
  );

-- 2. profiles.avatar_url ----------------------------------------------------------

alter table public.profiles add column if not exists avatar_url text;

-- 3. profiles.onboarded_at --------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'onboarded_at'
  ) then
    alter table public.profiles add column onboarded_at timestamptz;
    update public.profiles set onboarded_at = now();
  end if;
end $$;

-- 4. weekly_goal : 1 à 7 ------------------------------------------------------------
-- Si une valeur sort de la plage, l'ajout de la contrainte échoue et toute la
-- migration est annulée (aucune donnée modifiée en silence).

alter table public.profiles drop constraint if exists profiles_weekly_goal_range;
alter table public.profiles
  add constraint profiles_weekly_goal_range check (weekly_goal between 1 and 7);
alter table public.profiles alter column weekly_goal set default 3;

-- 5. Grants -----------------------------------------------------------------------------

grant update (display_name, weekly_goal, color_role, accent_color, avatar_url, onboarded_at)
  on public.profiles to authenticated;

-- 6. exercises.owner_profile_id ---------------------------------------------------------

alter table public.exercises
  add column if not exists owner_profile_id uuid
  references public.profiles (id) on delete cascade;

-- Un exercice est soit système (les deux null), soit perso (owner), soit du
-- duo (duo_id), jamais perso ET du duo.
alter table public.exercises drop constraint if exists exercises_owner_or_duo;
alter table public.exercises
  add constraint exercises_owner_or_duo check (owner_profile_id is null or duo_id is null);

create index if not exists idx_exercises_owner on public.exercises (owner_profile_id);

-- Policies exercises : les 4 de CM-59 remplacées par 4 nouvelles.
drop policy if exists exercises_select_system_or_duo   on public.exercises;
drop policy if exists exercises_insert_duo             on public.exercises;
drop policy if exists exercises_update_duo             on public.exercises;
drop policy if exists exercises_delete_duo             on public.exercises;
drop policy if exists exercises_select_system_owner_or_duo on public.exercises;
drop policy if exists exercises_insert_owner_or_duo        on public.exercises;
drop policy if exists exercises_update_owner_or_duo        on public.exercises;
drop policy if exists exercises_delete_owner_or_duo        on public.exercises;

-- Lecture : catalogue système, mes exercices perso, les exercices de mon duo.
create policy exercises_select_system_owner_or_duo on public.exercises
  for select to authenticated
  using (
    (duo_id is null and owner_profile_id is null)
    or owner_profile_id = (select auth.uid())
    or (duo_id is not null and public.is_duo_member(duo_id))
  );

-- Écriture : jamais un exercice système. Exercice perso à mon nom, ou
-- exercice de mon duo.
create policy exercises_insert_owner_or_duo on public.exercises
  for insert to authenticated
  with check (
    (owner_profile_id = (select auth.uid()) and duo_id is null)
    or (owner_profile_id is null and duo_id is not null
        and duo_id = (select public.my_duo_id()))
  );

create policy exercises_update_owner_or_duo on public.exercises
  for update to authenticated
  using (
    owner_profile_id = (select auth.uid())
    or (duo_id is not null and public.is_duo_member(duo_id))
  )
  with check (
    (owner_profile_id = (select auth.uid()) and duo_id is null)
    or (owner_profile_id is null and duo_id is not null
        and public.is_duo_member(duo_id))
  );

create policy exercises_delete_owner_or_duo on public.exercises
  for delete to authenticated
  using (
    owner_profile_id = (select auth.uid())
    or (duo_id is not null and public.is_duo_member(duo_id))
  );

commit;

-- ---------------------------------------------------------------------------
-- Vérification (lecture seule). Une ligne, dernière colonne `ok` = true.
-- ---------------------------------------------------------------------------

with v as (
  select
    -- Nouvelles colonnes présentes.
    (select count(*) from information_schema.columns
     where table_schema = 'public'
       and ((table_name = 'profiles'
             and column_name in ('accent_color', 'avatar_url', 'onboarded_at'))
            or (table_name = 'exercises' and column_name = 'owner_profile_id'))) = 4
      as colonnes_presentes,
    -- Contraintes posées et validées.
    (select count(*) from pg_constraint
     where convalidated
       and ((conrelid = 'public.profiles'::regclass
             and conname in ('profiles_accent_color_palette', 'profiles_weekly_goal_range'))
            or (conrelid = 'public.exercises'::regclass
                and conname in ('exercises_owner_or_duo', 'exercises_owner_profile_id_fkey')))) = 4
      as contraintes_presentes,
    -- Toujours 22 policies, dont les 4 nouvelles d'exercises.
    (select count(*) from pg_policies where schemaname = 'public') = 22
    and (select count(*) from pg_policies
         where schemaname = 'public' and tablename = 'exercises'
           and policyname in ('exercises_select_system_owner_or_duo',
                              'exercises_insert_owner_or_duo',
                              'exercises_update_owner_or_duo',
                              'exercises_delete_owner_or_duo')) = 4
      as policies_22,
    -- Chaque profil a une couleur de la palette ; Léa (elle) en rose.
    not exists (select 1 from public.profiles
                where accent_color is null
                   or accent_color not in ('#2FE6FF', '#FF4F7E', '#FF8A3D',
                                           '#A78BFA', '#5B8CFF', '#FFD23F'))
      as couleurs_ok,
    not exists (select 1 from public.profiles
                where color_role = 'elle' and accent_color <> '#FF4F7E')
      as elle_en_rose,
    -- Antoine et Léa ne repassent pas par l'onboarding.
    (select count(*) from public.profiles
     where id in ('11111111-1111-1111-1111-111111111111',
                  '22222222-2222-2222-2222-222222222222')
       and onboarded_at is not null) = 2
      as antoine_lea_onboardes,
    -- Données intactes (comptages au 10/10/2026 : 10, 190, 81).
    (select count(*) from public.sessions)     >= 10
    and (select count(*) from public.session_sets) >= 190
    and (select count(*) from public.exercises)    >= 81
      as donnees_intactes
)
select
  *,
  (colonnes_presentes and contraintes_presentes and policies_22 and couleurs_ok
   and elle_en_rose and antoine_lea_onboardes and donnees_intactes) as ok
from v;

-- ============================================================================
-- RETOUR ARRIÈRE (à décommenter et coller seul, en cas de besoin).
--
-- Perd les couleurs, avatars et dates d'onboarding saisis depuis, ainsi que
-- les exercices perso (owner_profile_id) : à ne faire qu'avant la sortie de
-- CM-86 / CM-87. Restaure exactement les 4 policies d'exercises de CM-59, les
-- grants et la contrainte weekly_goal (1 à 14, défaut 4) d'avant.
-- ============================================================================
--
-- begin;
--
-- drop policy if exists exercises_select_system_owner_or_duo on public.exercises;
-- drop policy if exists exercises_insert_owner_or_duo        on public.exercises;
-- drop policy if exists exercises_update_owner_or_duo        on public.exercises;
-- drop policy if exists exercises_delete_owner_or_duo        on public.exercises;
--
-- create policy exercises_select_system_or_duo on public.exercises
--   for select to authenticated
--   using (duo_id is null or public.is_duo_member(duo_id));
-- create policy exercises_insert_duo on public.exercises
--   for insert to authenticated
--   with check (duo_id is not null and duo_id = (select public.my_duo_id()));
-- create policy exercises_update_duo on public.exercises
--   for update to authenticated
--   using (duo_id is not null and public.is_duo_member(duo_id))
--   with check (duo_id is not null and public.is_duo_member(duo_id));
-- create policy exercises_delete_duo on public.exercises
--   for delete to authenticated
--   using (duo_id is not null and public.is_duo_member(duo_id));
--
-- -- Supprime aussi les exercices perso (et échoue s'ils sont utilisés dans une
-- -- séance ou un programme : FK on delete restrict ; les traiter avant).
-- delete from public.exercises where owner_profile_id is not null;
-- drop index if exists public.idx_exercises_owner;
-- alter table public.exercises drop constraint if exists exercises_owner_or_duo;
-- alter table public.exercises drop column if exists owner_profile_id;
--
-- revoke update on public.profiles from authenticated;
-- grant update (display_name, weekly_goal, color_role) on public.profiles to authenticated;
--
-- alter table public.profiles alter column weekly_goal set default 4;
-- alter table public.profiles drop constraint if exists profiles_weekly_goal_range;
-- alter table public.profiles
--   add constraint profiles_weekly_goal_range check (weekly_goal >= 1 and weekly_goal <= 14);
--
-- alter table public.profiles drop constraint if exists profiles_accent_color_palette;
-- alter table public.profiles drop column if exists accent_color;
-- alter table public.profiles drop column if exists avatar_url;
-- alter table public.profiles drop column if exists onboarded_at;
--
-- commit;
--
-- Puis, si le migration repair a été fait :
--   npx supabase migration repair --status reverted 20261010180000
