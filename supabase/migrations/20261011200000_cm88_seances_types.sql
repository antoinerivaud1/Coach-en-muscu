-- CM-88 (PR 5) : écritures des séances types en fonctions SQL atomiques.
--
-- La bibliothèque et l'éditeur de séances types passent dans le navigateur
-- (client anon + RLS). Les écritures en plusieurs étapes, qui étaient des
-- server actions (app/seances/actions.ts : saveSeance, duplicateSeance,
-- moveSeance), deviennent des RPC : tout ou rien, rien ne peut rester à
-- moitié écrit si le réseau coupe (sous PostgREST, un appel = une
-- transaction ; une erreur levée annule tout ce que la fonction a écrit).
--
--   save_seance(p_day_id, p_name, p_exercises, p_target, p_initial_target)
--     -> (day_id, program_id, copied)    création / édition d'une séance type
--   duplicate_seance(p_day_id) -> uuid   copie « <nom> (copie) » en fin de liste
--   move_seance(p_day_id, p_direction)   monter / descendre dans la bibliothèque
--   delete_seance(p_day_id)              suppression, refusée si historique
--
-- SECURITY INVOKER (défaut) : la RLS de CM-59 s'applique à chaque lecture et
-- écriture, exactement comme pour les server actions qu'elles remplacent
-- (client utilisateur). Aucune fonction ne reçoit d'id de profil : l'appelant
-- est toujours `auth.uid()`. Le passage « Partager » / « Garder pour moi »
-- réutilise `set_seance_shared` (CM-87, security definer, ses propres
-- contrôles), appelée DANS la même transaction.
--
-- Règles reprises à l'identique de saveSeance (CM-81, CM-86, CM-87) :
-- - duo ACTIF = deux membres ; seul dans son duo (invitation en attente) =
--   solo ; en solo, un choix « Pour qui ? » reçu = page périmée (refus) ;
-- - création : « Pour nous deux » par défaut en duo, « Pour moi » sinon ; le
--   programme du duo ou le programme perso est créé en silence au besoin
--   (le plus ancien est réutilisé) ;
-- - édition : seul un CHANGEMENT du choix affiché déplace la séance, après
--   relecture de l'état réel (C2) ; une séance du duo que le partenaire a déjà
--   utilisée est COPIÉE au lieu d'être déplacée (C1) et la copie reçoit les
--   modifications ;
-- - exercices : 1 au moins, sans doublon, bornes de l'éditeur
--   (lib/utils/seances.ts, SEANCE_DRAFT_LIMITS), chacun dans le catalogue de
--   l'appelant (système, ses exercices perso, ceux de son duo actif) ;
-- - nom : obligatoire, 40 caractères au plus, unique dans la bibliothèque
--   (casse et espaces de bord ignorés), la séance éditée exclue ;
-- - exercices remplacés (delete puis insert dans l'ordre reçu, order_index
--   0..n-1) : les séries réalisées référencent l'exercice, pas la ligne de
--   séance type, aucun historique n'est perdu ;
-- - séance du duo : mes exercices perso qu'elle contient deviennent des
--   exercices du duo (sinon le partenaire ne les verrait pas).
-- Nouveau : un verrou transactionnel (pg_advisory_xact_lock) sérialise les
-- écritures sur une même bibliothèque (deux créations simultanées ne créent
-- plus deux programmes ni deux fois le même nom).
--
-- Erreurs : `raise exception 'cm88:<code>'` (errcode P0001), traduites en
-- français côté app (lib/data/seances.ts) : not_authenticated,
-- invalid_input, stale_duo, no_exercises, exercise_invalid,
-- exercise_duplicate, exercise_bounds, reps_order, exercise_not_in_catalog,
-- seance_not_found, share_unreadable, name_required, name_too_long,
-- name_taken, seance_not_in_library, seance_has_history, refused. Celles de set_seance_shared
-- (`cm87:<code>`) remontent telles quelles.
--
-- Fonctions NOUVELLES uniquement : aucune table, policy ni fonction
-- existante n'est modifiée. Rejouable : `create or replace`, droits
-- idempotents.

-- 1. Création / édition d'une séance type -------------------------------------------

create or replace function public.save_seance(
  p_day_id uuid,
  p_name text,
  p_exercises jsonb,
  p_target text default null,
  p_initial_target text default null)
 returns table (day_id uuid, program_id uuid, copied boolean)
 language plpgsql
 security invoker
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  -- Duo ACTIF de l'appelant (deux membres), sinon null.
  v_duo uuid;
  v_item jsonb;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_sets numeric;
  v_min numeric;
  v_max numeric;
  v_rest numeric;
  v_name text;
  v_day public.program_days;
  v_program uuid;
  -- Séance réellement écrite (la copie perso si set_seance_shared a copié).
  v_edit uuid;
  v_target text;
  v_actual text;
  v_status text;
  v_moved uuid;
  v_copied boolean := false;
  v_order int;
begin
  if v_me is null then raise exception 'cm88:not_authenticated' using errcode = 'P0001'; end if;
  if (p_target is not null and p_target not in ('duo', 'perso'))
     or (p_initial_target is not null and p_initial_target not in ('duo', 'perso')) then
    raise exception 'cm88:invalid_input' using errcode = 'P0001';
  end if;

  -- Bibliothèque : duo actif ou solo (C3 : la lecture ne peut pas « échouer
  -- en solo » ici, une erreur annule tout).
  select m.duo_id into v_duo from public.duo_members m where m.profile_id = v_me;
  if v_duo is not null and not exists (
       select 1 from public.duo_members o
       where o.duo_id = v_duo and o.profile_id <> v_me) then
    v_duo := null;
  end if;
  -- Le choix « Pour qui ? » n'est montré qu'en duo : reçu en solo, la page
  -- est périmée.
  if v_duo is null and (p_target is not null or p_initial_target is not null) then
    raise exception 'cm88:stale_duo' using errcode = 'P0001';
  end if;

  -- Exercices : bornes et doublons (même règle que le client, qui fait foi
  -- ici).
  if p_exercises is null or jsonb_typeof(p_exercises) <> 'array' then
    raise exception 'cm88:invalid_input' using errcode = 'P0001';
  end if;
  if jsonb_array_length(p_exercises) = 0 then
    raise exception 'cm88:no_exercises' using errcode = 'P0001';
  end if;
  for v_item in select e.value from jsonb_array_elements(p_exercises) e loop
    if jsonb_typeof(v_item) <> 'object'
       or coalesce(v_item ->> 'exercise_id', '') !~*
          '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'cm88:exercise_invalid' using errcode = 'P0001';
    end if;
    v_id := (v_item ->> 'exercise_id')::uuid;
    if v_id = any (v_ids) then
      raise exception 'cm88:exercise_duplicate' using errcode = 'P0001';
    end if;
    v_ids := v_ids || v_id;

    v_sets := case when jsonb_typeof(v_item -> 'target_sets') = 'number'
                   then (v_item ->> 'target_sets')::numeric end;
    v_min := case when jsonb_typeof(v_item -> 'target_reps_min') = 'number'
                  then (v_item ->> 'target_reps_min')::numeric end;
    v_max := case when jsonb_typeof(v_item -> 'target_reps_max') = 'number'
                  then (v_item ->> 'target_reps_max')::numeric end;
    v_rest := case when jsonb_typeof(v_item -> 'rest_seconds') = 'number'
                   then (v_item ->> 'rest_seconds')::numeric end;
    if v_sets is null or v_sets <> trunc(v_sets) or v_sets not between 1 and 10
       or v_min is null or v_min <> trunc(v_min) or v_min not between 1 and 50
       or v_max is null or v_max <> trunc(v_max) or v_max not between 1 and 50
       or v_rest is null or v_rest <> trunc(v_rest) or v_rest not between 0 and 600 then
      raise exception 'cm88:exercise_bounds' using errcode = 'P0001';
    end if;
    if v_min > v_max then
      raise exception 'cm88:reps_order' using errcode = 'P0001';
    end if;
  end loop;

  -- Chaque exercice dans le catalogue de l'appelant : système, ses exercices
  -- perso, ceux de son duo actif (même filtre que `catalogFilter`). Un id
  -- arbitraire ne rattache pas l'exercice perso d'un autre compte.
  if exists (
    select 1 from unnest(v_ids) as x(id)
    where not exists (
      select 1 from public.exercises e
      where e.id = x.id
        and ((e.duo_id is null and e.owner_profile_id is null)
             or e.owner_profile_id = v_me
             or (v_duo is not null and e.duo_id = v_duo)))
  ) then
    raise exception 'cm88:exercise_not_in_catalog' using errcode = 'P0001';
  end if;

  if p_day_id is not null then
    -- ----- Édition -----
    -- Séance inexistante ou inaccessible : même erreur (rien ne révèle la
    -- séance d'un autre duo, CM-80).
    select d.* into v_day from public.program_days d where d.id = p_day_id;
    if v_day.id is null or not public.can_access_program(v_day.program_id) then
      raise exception 'cm88:seance_not_found' using errcode = 'P0001';
    end if;
    v_program := v_day.program_id;
    v_edit := v_day.id;

    -- CM-87 : « Partager avec … » / « Garder pour moi », seulement si le
    -- choix affiché a changé, après relecture de l'état réel (C2,
    -- `shareDecision` de lib/duo.ts).
    if v_duo is not null and p_target is not null and p_initial_target is not null
       and p_target <> p_initial_target then
      select case when p.duo_id is not null then 'duo' else 'perso' end
        into v_actual
        from public.programs p where p.id = v_day.program_id;
      if v_actual is null then
        raise exception 'cm88:share_unreadable' using errcode = 'P0001';
      end if;
      if v_actual <> p_target then
        if v_actual <> p_initial_target then
          raise exception 'cm88:stale_duo' using errcode = 'P0001';
        end if;
        -- Refuse un nom déjà pris de l'autre côté AVANT tout changement ;
        -- COPIE au lieu de déplacer si le partenaire l'a déjà utilisée (C1).
        select s.status, s.day_id into v_status, v_moved
          from public.set_seance_shared(v_day.id, p_target = 'duo') s;
        if v_status = 'copied' and v_moved is not null then
          v_edit := v_moved;
          v_copied := true;
        end if;
        select d.program_id into v_program from public.program_days d where d.id = v_edit;
        if v_program is null then
          raise exception 'cm88:seance_not_found' using errcode = 'P0001';
        end if;
      end if;
    end if;
  else
    -- ----- Création : bibliothèque d'arrivée, créée en silence au besoin -----
    v_target := case when v_duo is not null and coalesce(p_target, 'duo') = 'duo'
                     then 'duo' else 'perso' end;
    perform pg_advisory_xact_lock(hashtextextended(
      'cm88:library:' || case when v_target = 'duo' then v_duo else v_me end::text, 0));
    if v_target = 'duo' then
      select p.id into v_program from public.programs p
        where p.duo_id = v_duo and p.owner_profile_id is null
        order by p.created_at, p.id limit 1;
      if v_program is null then
        insert into public.programs (name, owner_profile_id, duo_id)
          values ('Nos séances', null, v_duo)
          returning id into v_program;
      end if;
    else
      select p.id into v_program from public.programs p
        where p.owner_profile_id = v_me and p.duo_id is null
        order by p.created_at, p.id limit 1;
      if v_program is null then
        insert into public.programs (name, owner_profile_id, duo_id)
          values ('Mes séances', v_me, null)
          returning id into v_program;
      end if;
    end if;
  end if;

  -- Une écriture à la fois par bibliothèque (unicité du nom, ordre).
  perform pg_advisory_xact_lock(hashtextextended('cm88:program:' || v_program::text, 0));

  -- ----- Nom -----
  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    raise exception 'cm88:name_required' using errcode = 'P0001';
  end if;
  if char_length(v_name) > 40 then
    raise exception 'cm88:name_too_long' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.program_days d
    where d.program_id = v_program
      and (v_edit is null or d.id <> v_edit)
      and lower(btrim(d.name)) = lower(v_name)
  ) then
    raise exception 'cm88:name_taken' using errcode = 'P0001';
  end if;

  -- ----- Séance -----
  if v_edit is not null then
    -- Sous RLS, un update refusé touche 0 ligne sans erreur.
    update public.program_days d set name = v_name where d.id = v_edit;
    if not found then raise exception 'cm88:refused' using errcode = 'P0001'; end if;
    delete from public.program_exercises pe where pe.program_day_id = v_edit;
  else
    select coalesce(max(d.order_index) + 1, 0) into v_order
      from public.program_days d where d.program_id = v_program;
    insert into public.program_days (program_id, name, order_index)
      values (v_program, v_name, v_order)
      returning id into v_edit;
  end if;

  -- ----- Exercices, dans l'ordre reçu (CM-71) -----
  insert into public.program_exercises
    (program_day_id, exercise_id, target_sets, target_reps_min, target_reps_max,
     rest_seconds, order_index)
    select v_edit,
           (e.value ->> 'exercise_id')::uuid,
           (e.value ->> 'target_sets')::numeric::int,
           (e.value ->> 'target_reps_min')::numeric::int,
           (e.value ->> 'target_reps_max')::numeric::int,
           (e.value ->> 'rest_seconds')::numeric::int,
           (e.ord - 1)::int
    from jsonb_array_elements(p_exercises) with ordinality as e(value, ord);

  -- ----- Séance du duo : mes exercices perso deviennent ceux du duo (CM-87) -----
  if v_duo is not null and exists (
       select 1 from public.programs p where p.id = v_program and p.duo_id = v_duo) then
    update public.exercises e
      set owner_profile_id = null, duo_id = v_duo
      where e.owner_profile_id = v_me and e.id = any (v_ids);
  end if;

  return query select v_edit, v_program, v_copied;
end;
$function$;

-- 2. Duplication ---------------------------------------------------------------------
-- Copie « <nom> (copie) » et TOUS ses exercices (séries, reps, repos, ordre),
-- ajoutée en fin de bibliothèque. Comme duplicateSeance : pas de contrôle de
-- nom (la copie se renomme ensuite dans l'éditeur).

create or replace function public.duplicate_seance(p_day_id uuid)
 returns uuid
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  v_me uuid := auth.uid();
  v_day public.program_days;
  v_order int;
  v_copy uuid;
begin
  if v_me is null then raise exception 'cm88:not_authenticated' using errcode = 'P0001'; end if;
  select d.* into v_day from public.program_days d where d.id = p_day_id;
  if v_day.id is null or not public.can_access_program(v_day.program_id) then
    raise exception 'cm88:seance_not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cm88:program:' || v_day.program_id::text, 0));

  select coalesce(max(d.order_index) + 1, 0) into v_order
    from public.program_days d where d.program_id = v_day.program_id;
  insert into public.program_days (program_id, name, order_index)
    values (v_day.program_id, v_day.name || ' (copie)', v_order)
    returning id into v_copy;
  insert into public.program_exercises
    (program_day_id, exercise_id, target_sets, target_reps_min, target_reps_max,
     rest_seconds, order_index)
    select v_copy, pe.exercise_id, pe.target_sets, pe.target_reps_min,
           pe.target_reps_max, pe.rest_seconds, pe.order_index
    from public.program_exercises pe
    where pe.program_day_id = v_day.id;
  return v_copy;
end;
$function$;

-- 3. Réordonnancement ----------------------------------------------------------------
-- Monte ou descend une séance d'un cran. Les order_index de toute la
-- bibliothèque sont réécrits en 0..n-1 (rattrape trous et doublons). Déjà en
-- butée : rien à faire, ce n'est pas une erreur.

create or replace function public.move_seance(p_day_id uuid, p_direction text)
 returns void
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  v_me uuid := auth.uid();
  v_day public.program_days;
  v_ids uuid[];
  v_from int;
  v_to int;
  r record;
begin
  if v_me is null then raise exception 'cm88:not_authenticated' using errcode = 'P0001'; end if;
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception 'cm88:invalid_input' using errcode = 'P0001';
  end if;
  select d.* into v_day from public.program_days d where d.id = p_day_id;
  if v_day.id is null or not public.can_access_program(v_day.program_id) then
    raise exception 'cm88:seance_not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cm88:program:' || v_day.program_id::text, 0));

  select array_agg(d.id order by d.order_index, d.id) into v_ids
    from public.program_days d where d.program_id = v_day.program_id;
  v_from := array_position(v_ids, v_day.id);
  if v_from is null then
    raise exception 'cm88:seance_not_in_library' using errcode = 'P0001';
  end if;
  v_to := case when p_direction = 'up' then v_from - 1 else v_from + 1 end;
  if v_to < 1 or v_to > cardinality(v_ids) then
    return;
  end if;
  v_ids[v_from] := v_ids[v_to];
  v_ids[v_to] := v_day.id;

  for r in
    select x.id, (x.ord - 1)::int as wanted, d.order_index
    from unnest(v_ids) with ordinality as x(id, ord)
    join public.program_days d on d.id = x.id
  loop
    if r.order_index <> r.wanted then
      -- Sous RLS, un update refusé touche 0 ligne sans erreur.
      update public.program_days d set order_index = r.wanted where d.id = r.id;
      if not found then raise exception 'cm88:refused' using errcode = 'P0001'; end if;
    end if;
  end loop;
end;
$function$;

-- 4. Suppression ---------------------------------------------------------------------
-- `sessions.program_day_id` est en ON DELETE SET NULL : supprimer une séance
-- type déjà réalisée détacherait en silence l'historique (les séances passées
-- perdraient leur nom). Refus dès qu'au moins une séance TERMINÉE
-- (`duration_seconds` renseigné, CM-83) avec des séries y est rattachée,
-- celles du partenaire comprises (lues sous RLS, comme l'ancien garde-fou).
-- Le nombre de séances part dans le DETAIL de l'erreur (message côté app).
-- Contrôle et suppression dans la même transaction, séance verrouillée :
-- une séance démarrée entre-temps sur cette séance type attend la fin.

create or replace function public.delete_seance(p_day_id uuid)
 returns void
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  v_me uuid := auth.uid();
  v_day public.program_days;
  v_logged int;
begin
  if v_me is null then raise exception 'cm88:not_authenticated' using errcode = 'P0001'; end if;
  select d.* into v_day from public.program_days d where d.id = p_day_id;
  if v_day.id is null or not public.can_access_program(v_day.program_id) then
    raise exception 'cm88:seance_not_found' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('cm88:program:' || v_day.program_id::text, 0));
  -- Verrou de la ligne : un insert de séance qui la référence (FOR KEY
  -- SHARE) attend la fin de la suppression, puis échoue proprement.
  perform 1 from public.program_days d where d.id = v_day.id for update;
  if not found then
    raise exception 'cm88:seance_not_found' using errcode = 'P0001';
  end if;

  select count(*)::int into v_logged
    from public.sessions s
    where s.program_day_id = v_day.id
      and s.duration_seconds is not null
      and exists (select 1 from public.session_sets ss where ss.session_id = s.id);
  if v_logged > 0 then
    raise exception 'cm88:seance_has_history'
      using errcode = 'P0001', detail = v_logged::text;
  end if;

  -- Sous RLS, un delete refusé touche 0 ligne sans erreur.
  delete from public.program_days d where d.id = v_day.id;
  if not found then raise exception 'cm88:refused' using errcode = 'P0001'; end if;
end;
$function$;

-- 5. Droits --------------------------------------------------------------------------
-- EXECUTE à PUBLIC est un défaut global de PostgreSQL (voir CM-59) : revoke
-- explicite, puis `authenticated` seulement.

revoke all on function
  public.save_seance(uuid, text, jsonb, text, text),
  public.duplicate_seance(uuid),
  public.move_seance(uuid, text),
  public.delete_seance(uuid)
  from public, anon, service_role;

grant execute on function
  public.save_seance(uuid, text, jsonb, text, text),
  public.duplicate_seance(uuid),
  public.move_seance(uuid, text),
  public.delete_seance(uuid)
  to authenticated;
