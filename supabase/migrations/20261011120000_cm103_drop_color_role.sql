-- CM-103 : retrait de `profiles.color_role` (ancien rôle couleur 'toi' /
-- 'elle'), remplacé par `profiles.accent_color` depuis CM-86.
--
-- ORDRE IMPÉRATIF : à appliquer en prod UNIQUEMENT APRÈS le déploiement du
-- code de CM-103 (plus aucune lecture de color_role dans app/, lib/,
-- components/). Appliqué avant, l'ancien code en prod lirait une colonne
-- disparue. Procédure : supabase/ops/2026-10-cm103-drop-color-role.sql.
--
-- Ce que fait cette migration :
-- 1. `handle_new_user()` (trigger `on_auth_user_created`, version CM-58)
--    n'écrit plus color_role : même comportement sinon (prénom des
--    métadonnées, sinon début de l'email, sinon « Moi » ; `on conflict do
--    nothing` pour un profil déjà présent ; couleur = défaut de la colonne
--    accent_color). C'était la seule fonction SQL qui lisait color_role
--    (vérifié : les RPC cm87_* et du duo ne la lisent pas) ; un contrôle en
--    fin de fichier échoue si une fonction de `public` la cite encore ;
-- 2. droit UPDATE de `authenticated` sur la colonne retiré (grant colonne de
--    CM-59 / CM-86) ;
-- 3. colonne supprimée ;
-- 4. type enum `public.color_role` supprimé s'il n'est plus utilisé par
--    aucun objet (sinon conservé, avec un avertissement).
--
-- Aucune donnée utile perdue : accent_color a été remplie depuis color_role
-- par CM-86 ('elle' -> rose, sinon cyan) et l'app ne lit plus que
-- accent_color.
--
-- Rejouable : `create or replace`, `if exists`, blocs conditionnels.

-- 1. handle_new_user sans color_role ------------------------------------------

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Moi'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- Le trigger `on_auth_user_created` (CM-58) n'est PAS recréé : il appelle
-- déjà cette fonction, `create or replace` suffit (recréer le trigger
-- prendrait un verrou exclusif sur auth.users).

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

-- Garde-fou : plus aucune fonction de `public` ne doit citer color_role
-- (sinon elle échouerait à l'exécution une fois la colonne supprimée).
do $$
declare
  v_fn text;
begin
  select string_agg(p.oid::regprocedure::text, ', ') into v_fn
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc ~* 'color_role';
  if v_fn is not null then
    raise exception 'cm103: fonctions qui lisent encore color_role : %', v_fn;
  end if;
end $$;

-- 2. Droit UPDATE sur la colonne -----------------------------------------------

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'profiles'
               and column_name = 'color_role') then
    revoke update (color_role) on public.profiles from authenticated;
  end if;
end $$;

-- 3. Colonne --------------------------------------------------------------------

alter table public.profiles drop column if exists color_role;

-- 4. Type enum, s'il n'est plus utilisé -----------------------------------------

do $$
declare
  v_type oid := to_regtype('public.color_role');
begin
  if v_type is null then
    return;
  end if;
  -- Dépendances « normales » (colonnes, signatures de fonctions…) ; le type
  -- tableau associé (dépendance interne) part avec le type.
  if exists (select 1 from pg_depend
             where refclassid = 'pg_type'::regclass and refobjid = v_type
               and deptype = 'n') then
    raise warning 'cm103: type public.color_role encore utilisé, conservé';
  else
    drop type public.color_role;
  end if;
end $$;
