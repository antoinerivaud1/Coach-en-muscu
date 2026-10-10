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
