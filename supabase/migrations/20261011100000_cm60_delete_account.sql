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
  -- FOR NO KEY UPDATE et non FOR UPDATE : il reste compatible avec le FOR KEY
  -- SHARE que posent les écritures qui RÉFÉRENCENT ce profil. Un leave_duo
  -- concurrent du partenaire (verrou du duo, puis exercices et séances types
  -- passés au nom de l'appelant) n'entre donc pas en interblocage avec nous :
  -- il se termine, puis nous prenons le verrou du duo (déjà dissous).
  perform 1 from public.profiles where id = v_me for no key update;
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
