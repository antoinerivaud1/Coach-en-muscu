-- CM-85 partie A, M2 du cadrage : chaque profil EST un compte Auth.
--
-- Depuis CM-58, les comptes d'Antoine et de Léa ont été créés avec
-- `auth.users.id` = id de leur profil (11111111-… et 22222222-…). On pose
-- maintenant la clé étrangère `profiles.id → auth.users(id)` :
-- - `on delete cascade` : supprimer un compte (CM-60) supprime son profil et,
--   par les cascades existantes, ses séances, séries et programmes perso ;
-- - plus de valeur par défaut sur `profiles.id` : l'id vient toujours
--   d'`auth.users` (trigger `on_auth_user_created`).
--
-- Garde-fou : si un profil n'a pas de compte, la migration échoue AVANT tout
-- changement, avec la liste des ids fautifs. Rien n'est supprimé ni déplacé.
--
-- Idempotente : rejouable sans effet (contrainte créée seulement si absente).

do $$
declare
  v_orphans text;
begin
  select string_agg(p.id::text, ', ' order by p.id)
    into v_orphans
  from public.profiles p
  where not exists (select 1 from auth.users u where u.id = p.id);

  if v_orphans is not null then
    raise exception 'CM-85 : profils sans compte Auth (%). Créer les comptes avant d''appliquer cette migration.', v_orphans;
  end if;
end $$;

alter table public.profiles alter column id drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_id_fkey'
  ) then
    alter table public.profiles
      add constraint profiles_id_fkey foreign key (id)
      references auth.users (id) on delete cascade;
  end if;
end $$;
