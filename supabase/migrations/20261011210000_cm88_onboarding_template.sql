-- CM-88 (PR 7) : « Ajouter et c'est parti » (onboarding, étape 3) en UNE
-- transaction, appelée depuis le navigateur.
--
-- Avant : server action en plusieurs écritures (programme perso, séances
-- types une par une, leurs exercices, puis `onboarded_at`), avec un
-- nettoyage « à la main » en cas d'échec, qui ne protégeait pas d'une coupure
-- réseau au milieu. Décision d'Antoine : les écritures en plusieurs étapes
-- deviennent des fonctions SQL atomiques. Sous PostgREST, une erreur annule
-- tout : rien ne peut rester à moitié écrit.
--
-- Une seule fonction, nouvelle : apply_onboarding_template(p_seances jsonb)
-- -> nombre de séances types créées. SECURITY INVOKER : la RLS de CM-59
-- s'applique comme pour les écritures directes de l'app (programme perso à
-- mon nom, séances types et exercices d'un programme accessible, exercices
-- du catalogue système). Elle n'agit que pour l'appelant (`auth.uid()`),
-- aucun identifiant de profil en paramètre.
--
-- `p_seances` : les séances du modèle choisi (lib/onboardingTemplates.ts),
--   [{ "name": "Push", "exercises": [{ "name": "Squat barre", "sets": 4,
--      "repsMin": 6, "repsMax": 8, "restSeconds": 150 }, ...] }, ...]
-- Les exercices sont désignés par le NOM d'un exercice système (catalogue
-- commun : duo_id et owner_profile_id null) ; un nom absent du catalogue est
-- ignoré, une séance sans aucun exercice trouvé n'est pas créée (comme
-- avant).
--
-- Déroulé :
-- 1. verrou de mon profil (deux taps, deux appareils : l'un après l'autre) ;
-- 2. programme perso le plus ancien (`owner_profile_id` = moi, `duo_id`
--    null), créé (« Mes séances ») s'il n'existe pas : un modèle
--    d'onboarding va TOUJOURS dans la bibliothèque perso ;
-- 3. séances types en fin de bibliothèque, nom libre : « Push », sinon
--    « Push 2 », « Push 3 »... (comparaison sans casse ni accents, comme
--    `uniqueSeanceName`, lib/onboardingTemplates.ts) ;
-- 4. `onboarded_at = now()` s'il n'était pas déjà posé.
--
-- Erreurs : `raise exception 'cm88:<code>'` (errcode P0001), traduites côté
-- app (lib/data/onboarding.ts) : not_authenticated, template_invalid,
-- profile_not_found, template_empty.
--
-- Rien d'autre n'est modifié : aucune table, aucune policy, aucun droit sur
-- les tables, aucune fonction existante.

create or replace function public.apply_onboarding_template(p_seances jsonb)
 returns integer
 language plpgsql
 security invoker
 set search_path to ''
as $function$
declare
  -- Clé de comparaison des noms : sans accents, sans casse, espaces réduits.
  v_from constant text := 'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ';
  v_to   constant text := 'AAAAAACEEEEIIIINOOOOOUUUUYaaaaaaceeeeiiiinooooouuuuyy';
  v_me uuid := auth.uid();
  v_program uuid;
  v_order int;
  v_taken text[];
  v_created int := 0;
  v_seance jsonb;
  v_base text;
  v_name text;
  v_n int;
  v_day uuid;
  v_found int;
begin
  if v_me is null then raise exception 'cm88:not_authenticated' using errcode = 'P0001'; end if;
  if p_seances is null or jsonb_typeof(p_seances) <> 'array'
     or jsonb_array_length(p_seances) = 0 or jsonb_array_length(p_seances) > 10 then
    raise exception 'cm88:template_invalid' using errcode = 'P0001';
  end if;

  -- 1. Verrou de mon profil (la RLS ne laisse voir et verrouiller que le mien).
  perform 1 from public.profiles where id = v_me for no key update;
  if not found then raise exception 'cm88:profile_not_found' using errcode = 'P0001'; end if;

  -- 2. Bibliothèque perso.
  select id into v_program from public.programs
    where owner_profile_id = v_me and duo_id is null
    order by created_at, id
    limit 1;
  if v_program is null then
    insert into public.programs (name, owner_profile_id, duo_id)
      values ('Mes séances', v_me, null)
      returning id into v_program;
  end if;

  select coalesce(max(order_index) + 1, 0) into v_order
    from public.program_days where program_id = v_program;
  select coalesce(array_agg(lower(regexp_replace(btrim(translate(name, v_from, v_to)), '\s+', ' ', 'g'))), '{}')
    into v_taken
    from public.program_days where program_id = v_program;

  -- 3. Séances types du modèle.
  for v_seance in select value from jsonb_array_elements(p_seances) loop
    v_base := regexp_replace(btrim(coalesce(v_seance ->> 'name', '')), '\s+', ' ', 'g');
    if v_base = '' or char_length(v_base) > 37
       or jsonb_typeof(v_seance -> 'exercises') is distinct from 'array'
       or jsonb_array_length(v_seance -> 'exercises') > 20 then
      raise exception 'cm88:template_invalid' using errcode = 'P0001';
    end if;

    -- Exercices du catalogue système trouvés pour cette séance.
    select count(*) into v_found
      from jsonb_array_elements(v_seance -> 'exercises') e
      where exists (
        select 1 from public.exercises x
        where x.name = e ->> 'name' and x.duo_id is null and x.owner_profile_id is null);
    if v_found = 0 then continue; end if;

    v_name := v_base;
    v_n := 1;
    while lower(regexp_replace(btrim(translate(v_name, v_from, v_to)), '\s+', ' ', 'g')) = any (v_taken) loop
      v_n := v_n + 1;
      v_name := v_base || ' ' || v_n;
    end loop;
    v_taken := v_taken || lower(regexp_replace(btrim(translate(v_name, v_from, v_to)), '\s+', ' ', 'g'));

    insert into public.program_days (program_id, name, order_index)
      values (v_program, v_name, v_order)
      returning id into v_day;
    v_order := v_order + 1;

    insert into public.program_exercises (
      program_day_id, exercise_id, order_index, target_sets,
      target_reps_min, target_reps_max, rest_seconds)
    select v_day, x.id, (row_number() over (order by e.ord) - 1)::int,
           (e.item ->> 'sets')::int, (e.item ->> 'repsMin')::int,
           (e.item ->> 'repsMax')::int, (e.item ->> 'restSeconds')::int
      from jsonb_array_elements(v_seance -> 'exercises') with ordinality as e(item, ord)
      cross join lateral (
        select x.id from public.exercises x
        where x.name = e.item ->> 'name' and x.duo_id is null and x.owner_profile_id is null
        order by x.id
        limit 1) x;

    v_created := v_created + 1;
  end loop;

  if v_created = 0 then raise exception 'cm88:template_empty' using errcode = 'P0001'; end if;

  -- 4. Onboarding terminé (une seule fois).
  update public.profiles set onboarded_at = now()
    where id = v_me and onboarded_at is null;

  return v_created;
end;
$function$;

-- EXECUTE à PUBLIC est un défaut global de PostgreSQL (voir CM-59) : retiré,
-- puis donné à `authenticated` seulement.
revoke all on function public.apply_onboarding_template(jsonb) from public, anon;
grant execute on function public.apply_onboarding_template(jsonb) to authenticated;
