-- ============================================================================
-- CM-60 : suppression du compte depuis l'app. Fichier UNIQUE à coller dans
-- Supabase, SQL Editor (PROD, projet coach-en-muscu).
--
-- Contenu = la migration du repo, À L'IDENTIQUE, dans une transaction :
--   supabase/migrations/20261011100000_cm60_delete_account.sql
-- Si une instruction échoue, rien n'est appliqué (rollback automatique).
-- Rejouable : `create or replace`, droits idempotents.
--
-- Prérequis : RPC du duo CM-87 appliquées (ops/2026-10-cm87-duo-rpc.sql) :
-- la fonction réutilise cm87_dissolve_solo_duo, cm87_move_day et
-- cm87_personal_program.
--
-- Sans interruption et inerte : ajoute UNE fonction, ne modifie aucune ligne,
-- aucune policy, aucun droit sur les tables. Rien n'est supprimé tant que
-- personne n'appelle delete_my_account depuis l'app (écran Profil de la PR).
--
-- La dernière requête renvoie UNE ligne : `ok` (dernière colonne) doit valoir
-- true. Les colonnes précédentes disent quel contrôle a échoué le cas échéant.
-- À appliquer AVANT de merger la PR.
--
-- Retour arrière : bloc commenté en bas du fichier.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 20261011100000_cm60_delete_account.sql
-- ---------------------------------------------------------------------------

-- CM-60 : suppression du compte depuis l'app (App Store, guideline 5.1.1(v)).
--
-- Une seule fonction appelable : delete_my_account(p_confirmation text).
-- SECURITY DEFINER (search_path vide, noms qualifiés), EXECUTE pour
-- `authenticated` seulement. Elle supprime le compte de l'APPELANT
-- (`auth.uid()`), jamais un autre : aucun identifiant en paramètre. Pas
-- d'Edge Function ni de clé service-role : la fonction appartient à
-- `postgres`, qui a DELETE sur auth.users.
--
-- Déroulé, dans UNE transaction (un échec n'efface rien) :
-- 1. p_confirmation doit valoir exactement 'SUPPRIMER' ;
-- 2. duo : en duo à deux, l'appelant sort de duo_members puis le duo est
--    dissous au profit du PARTENAIRE (cm87_dissolve_solo_duo, comme à la fin
--    de leave_duo) : la bibliothèque du duo (séances types, exercices du duo)
--    devient la sienne, mêmes lignes, mêmes ids. Pas de copie pour l'appelant
--    (il est supprimé). Seul dans un duo (invitation en attente) : ce duo est
--    dissous (tout redevient perso, puis est supprimé avec le reste) ;
-- 3. ses invitations encore actives sont révoquées ;
-- 4. ce que d'AUTRES utilisent encore leur est laissé (cas théoriques, que
--    l'app ne produit pas, mais l'historique peut en contenir) :
--    - une séance type perso de l'appelant sur laquelle un autre a une
--      séance passe dans la bibliothèque perso de cet autre (sinon sa séance
--      perdrait son nom, `sessions.program_day_id` étant ON DELETE SET NULL) ;
--    - un exercice perso de l'appelant utilisé par la série ou la séance type
--      d'un autre passe au nom de cet autre ;
-- 5. suppressions explicites, dans l'ordre des dépendances : séries, séances,
--    programmes perso (séances types et leurs exercices en cascade), puis
--    exercices perso. Ordre obligatoire : session_sets.exercise_id et
--    program_exercises.exercise_id sont ON DELETE RESTRICT, une suppression
--    du seul compte (cascade) est refusée dès qu'un exercice perso est
--    utilisé ;
-- 6. suppression de auth.users : la cascade emporte le profil, les
--    identités, sessions et jetons Auth et les invitations créées
--    (duo_invitations.created_by) ; accepted_by et duos.created_by passent à
--    null.
--
-- Jamais touché : séances, séries, séances types et exercices du partenaire
-- (ni de personne d'autre), catalogue système.
--
-- Erreurs : `raise exception 'cm60:<code>'` (errcode P0001), traduites côté
-- app (lib/accountDeletion.ts) : not_authenticated, confirmation_required,
-- account_not_found. Les erreurs cm87_ des fonctions réutilisées remontent
-- telles quelles (et annulent tout).
--
-- Rejouable : `create or replace`, droits idempotents. Inerte pour l'app
-- tant qu'aucun écran ne l'appelle.

create or replace function public.delete_my_account(p_confirmation text)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_me uuid := auth.uid();
  v_duo uuid;
  v_partner uuid;
  v_deleted int;
  r record;
begin
  if v_me is null then raise exception 'cm60:not_authenticated'; end if;
  if p_confirmation is distinct from 'SUPPRIMER' then
    raise exception 'cm60:confirmation_required';
  end if;
  -- Verrou du profil : deux appels simultanés (double tap, deux appareils)
  -- s'exécutent l'un après l'autre ; le second ne trouve plus le compte.
  perform 1 from public.profiles where id = v_me for update;
  if not found then raise exception 'cm60:account_not_found'; end if;

  -- 2. Duo -------------------------------------------------------------------------
  select duo_id into v_duo from public.duo_members where profile_id = v_me;
  if v_duo is not null then
    perform 1 from public.duos where id = v_duo for update;
    select profile_id into v_partner from public.duo_members
      where duo_id = v_duo and profile_id <> v_me;
    if v_partner is null then
      perform public.cm87_dissolve_solo_duo(v_me, v_duo);
    else
      delete from public.duo_members where duo_id = v_duo and profile_id = v_me;
      perform public.cm87_dissolve_solo_duo(v_partner, v_duo);
    end if;
  end if;

  -- 3. Invitations -----------------------------------------------------------------
  update public.duo_invitations
    set revoked_at = now()
    where created_by = v_me and accepted_at is null and revoked_at is null;

  -- 4. Ce que d'autres utilisent encore ----------------------------------------------
  for r in
    select distinct on (d.id) d.id, s.profile_id as other
    from public.program_days d
    join public.programs p on p.id = d.program_id
    join public.sessions s on s.program_day_id = d.id
    where p.owner_profile_id = v_me and s.profile_id <> v_me
    order by d.id, s.performed_at, s.id
  loop
    perform public.cm87_move_day(r.id, public.cm87_personal_program(r.other), true);
  end loop;

  update public.exercises e
    set owner_profile_id = coalesce(
      (select s.profile_id from public.session_sets ss
       join public.sessions s on s.id = ss.session_id
       where ss.exercise_id = e.id and s.profile_id <> v_me
       order by s.performed_at, s.id limit 1),
      (select p.owner_profile_id from public.program_exercises pe
       join public.program_days d on d.id = pe.program_day_id
       join public.programs p on p.id = d.program_id
       where pe.exercise_id = e.id
         and p.owner_profile_id is not null and p.owner_profile_id <> v_me
       order by p.created_at, p.id limit 1))
    where e.owner_profile_id = v_me
      and (exists (select 1 from public.session_sets ss
                   join public.sessions s on s.id = ss.session_id
                   where ss.exercise_id = e.id and s.profile_id <> v_me)
           or exists (select 1 from public.program_exercises pe
                      join public.program_days d on d.id = pe.program_day_id
                      join public.programs p on p.id = d.program_id
                      where pe.exercise_id = e.id
                        and p.owner_profile_id is not null and p.owner_profile_id <> v_me));

  -- 5. Données de l'appelant, dans l'ordre des dépendances ---------------------------
  delete from public.session_sets ss
    using public.sessions s
    where s.id = ss.session_id and s.profile_id = v_me;
  delete from public.sessions where profile_id = v_me;
  delete from public.programs where owner_profile_id = v_me;
  delete from public.exercises where owner_profile_id = v_me;

  -- 6. Compte Auth (profil et le reste en cascade) -----------------------------------
  delete from auth.users where id = v_me;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then raise exception 'cm60:account_not_found'; end if;
end;
$function$;

-- Droits ---------------------------------------------------------------------------
-- EXECUTE à PUBLIC est un défaut global de PostgreSQL (voir CM-59) : revoke
-- explicite. service_role n'a pas d'utilisateur (auth.uid() null) : aucun droit.

revoke all on function public.delete_my_account(text) from public, anon, service_role;
grant execute on function public.delete_my_account(text) to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Vérification (lecture seule). Une ligne, dernière colonne `ok` = true.
-- ---------------------------------------------------------------------------

with f as (
  select p.oid, p.prosecdef, p.proconfig, p.proacl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_my_account'
),
v as (
  select
    (select count(*) from f) = 1
      and (select pg_get_function_identity_arguments(oid) from f) = 'p_confirmation text'
      as fonction_presente,
    (select prosecdef and proconfig @> array['search_path=""'] from f)
      as definer_search_path,
    (select has_function_privilege('authenticated', oid, 'execute') from f)
      as authenticated_execute,
    (select not has_function_privilege('anon', oid, 'execute')
            and not has_function_privilege('service_role', oid, 'execute')
            and proacl is not null
            and not exists (select 1 from aclexplode(proacl) a
                            where a.grantee = 0 and a.privilege_type = 'EXECUTE')
     from f) as anon_public_refuses,
    (select count(*) from pg_policies where schemaname = 'public') = 22 as policies_22,
    -- Données intactes (comptages au 10/10/2026 : 10, 190, 81 ; Antoine et
    -- Léa, toujours en duo).
    (select count(*) from public.sessions)     >= 10
    and (select count(*) from public.session_sets) >= 190
    and (select count(*) from public.exercises)    >= 81
      as donnees_intactes,
    (select count(*) from public.profiles
     where id in ('11111111-1111-1111-1111-111111111111',
                  '22222222-2222-2222-2222-222222222222')) = 2
    and (select count(*) from auth.users
         where id in ('11111111-1111-1111-1111-111111111111',
                      '22222222-2222-2222-2222-222222222222')) = 2
    and (select count(*) from public.duo_members
         where duo_id = '33333333-3333-3333-3333-333333333333') = 2
      as deux_profils_et_duo_intacts
)
select
  *,
  (fonction_presente and definer_search_path and authenticated_execute
   and anon_public_refuses and policies_22 and donnees_intactes
   and deux_profils_et_duo_intacts) as ok
from v;

-- ============================================================================
-- RETOUR ARRIÈRE (à décommenter et coller seul, en cas de besoin).
--
-- Retire la fonction : l'écran « Supprimer mon compte » affiche alors une
-- erreur (rien n'est supprimé), l'export reste disponible. Les comptes déjà
-- supprimés ne reviennent pas (restauration de sauvegarde uniquement).
-- ============================================================================
--
-- begin;
--
-- drop function if exists public.delete_my_account(text);
--
-- commit;
--
-- Puis, si le migration repair a été fait :
--   npx supabase migration repair --status reverted 20261011100000
