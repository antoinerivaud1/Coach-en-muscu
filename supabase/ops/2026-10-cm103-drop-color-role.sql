-- ============================================================================
-- CM-103 : retrait de profiles.color_role. Fichier UNIQUE à coller dans
-- Supabase, SQL Editor (PROD, projet coach-en-muscu).
--
-- !!! À APPLIQUER UNIQUEMENT APRÈS LE DÉPLOIEMENT DU CODE DE CM-103 !!!
-- Ordre : 1) merger la PR CM-103 ; 2) vérifier que le déploiement Vercel de
-- production est terminé et sert le nouveau code (plus aucune lecture de
-- color_role) ; 3) SEULEMENT ENSUITE, coller ce fichier. Appliqué avant,
-- l'app encore en prod (CM-87) lirait une colonne disparue (Profil,
-- onboarding : erreur « column profiles.color_role does not exist »).
--
-- !!! Une fois ce SQL appliqué, ne jamais revenir sur Vercel à un
-- déploiement antérieur à la PR #40 (Profil et onboarding casseraient :
-- l'ancien code lit color_role). Revenir en arrière côté code impose
-- d'abord le RETOUR ARRIÈRE SQL en bas de ce fichier. !!!
--
-- Contenu = la migration du repo, À L'IDENTIQUE, dans une transaction :
--   supabase/migrations/20261011120000_cm103_drop_color_role.sql
-- Si une instruction échoue, rien n'est appliqué (rollback automatique).
-- Rejouable : `create or replace`, `if exists`, blocs conditionnels ; un
-- second passage ne change rien et la vérification renvoie encore ok = true.
--
-- Prérequis : socle CM-86 appliqué (profiles.accent_color, remplie depuis
-- color_role : 'elle' -> rose, sinon cyan) et RPC CM-87 appliquées.
--
-- Sans interruption : remplace handle_new_user (fonction du trigger
-- d'inscription, trigger lui-même non recréé : aucun verrou sur auth.users),
-- retire un droit de colonne, supprime une colonne et un type enum devenus
-- inutiles. Aucune autre donnée touchée ; couleurs d'Antoine et Léa
-- (accent_color) inchangées.
--
-- La dernière requête renvoie UNE ligne : `ok` (dernière colonne) doit valoir
-- true. Les colonnes précédentes disent quel contrôle a échoué le cas échéant.
--
-- Retour arrière : bloc commenté en bas du fichier.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 20261011120000_cm103_drop_color_role.sql
-- ---------------------------------------------------------------------------

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

commit;

-- ---------------------------------------------------------------------------
-- Vérification (lecture seule). Une ligne, dernière colonne `ok` = true.
-- ---------------------------------------------------------------------------

with v as (
  select
    not exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'profiles'
                  and column_name = 'color_role') as colonne_supprimee,
    to_regtype('public.color_role') is null as type_supprime,
    -- Plus aucune fonction de public ne cite color_role.
    not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                where n.nspname = 'public' and p.prosrc ~* 'color_role')
      as fonctions_sans_color_role,
    -- Trigger d'inscription en place, fonction durcie, fermée aux clients.
    exists (select 1 from pg_trigger
            where tgname = 'on_auth_user_created'
              and tgrelid = 'auth.users'::regclass and tgenabled <> 'D')
    and (select prosecdef and proconfig @> array['search_path=""']
         from pg_proc where oid = 'public.handle_new_user()'::regprocedure)
    and not has_function_privilege('authenticated', 'public.handle_new_user()', 'execute')
    and not has_function_privilege('anon', 'public.handle_new_user()', 'execute')
      as trigger_inscription_ok,
    -- authenticated : UPDATE sur les 5 colonnes de profil, rien d'autre.
    (select array_agg(column_name::text order by column_name::text)
     from information_schema.column_privileges
     where table_schema = 'public' and table_name = 'profiles'
       and grantee = 'authenticated' and privilege_type = 'UPDATE')
      = array['accent_color', 'avatar_url', 'display_name', 'onboarded_at', 'weekly_goal']
      as droits_update_ok,
    -- Couleurs intactes : chaque profil a une couleur de la palette.
    not exists (select 1 from public.profiles
                where accent_color is null
                   or accent_color not in ('#2FE6FF', '#FF4F7E', '#FF8A3D',
                                           '#A78BFA', '#5B8CFF', '#FFD23F'))
      as couleurs_ok,
    -- Antoine et Léa : profils présents, toujours dans leur duo.
    (select count(*) from public.profiles
     where id in ('11111111-1111-1111-1111-111111111111',
                  '22222222-2222-2222-2222-222222222222')) = 2
    and (select count(*) from public.duo_members
         where duo_id = '33333333-3333-3333-3333-333333333333') = 2
      as antoine_lea_intacts,
    -- Données intactes (comptages au 10/10/2026 : 10, 190, 81).
    (select count(*) from public.sessions)     >= 10
    and (select count(*) from public.session_sets) >= 190
    and (select count(*) from public.exercises)    >= 81
      as donnees_intactes
)
select
  *,
  (colonne_supprimee and type_supprime and fonctions_sans_color_role
   and trigger_inscription_ok and droits_update_ok and couleurs_ok
   and antoine_lea_intacts and donnees_intactes) as ok
from v;

-- ============================================================================
-- RETOUR ARRIÈRE (à décommenter et coller seul, en cas de besoin).
--
-- Recrée le type et la colonne, remplie depuis accent_color (rose -> 'elle',
-- sinon 'toi', comme avant CM-86), redonne le droit UPDATE et remet la
-- version CM-58 de handle_new_user. Inutile pour l'app de CM-103, qui ne lit
-- plus color_role : seulement pour revenir à un code d'avant CM-103.
-- ============================================================================
--
-- begin;
--
-- do $$ begin
--   if to_regtype('public.color_role') is null then
--     create type public.color_role as enum ('toi', 'elle');
--   end if;
-- end $$;
-- alter table public.profiles
--   add column if not exists color_role public.color_role not null default 'toi';
-- update public.profiles
--   set color_role = case when accent_color = '#FF4F7E' then 'elle'::public.color_role
--                         else 'toi'::public.color_role end;
-- grant update (color_role) on public.profiles to authenticated;
--
-- create or replace function public.handle_new_user()
--  returns trigger
--  language plpgsql
--  security definer
--  set search_path to ''
-- as $function$
-- declare
--   v_role text := new.raw_user_meta_data->>'color_role';
-- begin
--   insert into public.profiles (id, display_name, color_role)
--   values (
--     new.id,
--     coalesce(
--       nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
--       nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
--       'Moi'
--     ),
--     case when v_role in ('toi', 'elle') then v_role::public.color_role
--          else 'toi'::public.color_role end
--   )
--   on conflict (id) do nothing;
--   return new;
-- end;
-- $function$;
-- revoke all on function public.handle_new_user() from public, anon, authenticated;
-- grant execute on function public.handle_new_user() to service_role;
--
-- commit;
--
-- Puis, si le migration repair a été fait :
--   npx supabase migration repair --status reverted 20261011120000
