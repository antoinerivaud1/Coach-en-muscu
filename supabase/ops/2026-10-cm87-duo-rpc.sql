-- ============================================================================
-- CM-87 : duo optionnel (RPC). Fichier UNIQUE à coller dans Supabase, SQL
-- Editor (PROD, projet coach-en-muscu).
--
-- Contenu = la migration du repo, À L'IDENTIQUE, dans une transaction :
--   supabase/migrations/20261010191000_cm87_duo_rpc.sql
-- Si une instruction échoue, rien n'est appliqué (rollback automatique).
-- Rejouable : `create or replace`, `drop function if exists` avant la
-- recréation de set_seance_shared (type de retour), index `if not exists`.
--
-- Prérequis : socle CM-86 / CM-87 appliqué (ops/2026-10-cm86-socle-profil.sql,
-- colonnes accent_color et exercises.owner_profile_id) et extension pgcrypto
-- dans le schéma `extensions` (présente par défaut sur Supabase).
--
-- Sans interruption : ajoute des fonctions et un index ; ne modifie aucune
-- ligne, aucune policy, aucun droit sur les tables. Le duo d'Antoine et Léa
-- (3333…) n'est touché que si l'un d'eux appelle une RPC depuis l'app.
--
-- La dernière requête renvoie UNE ligne : `ok` (dernière colonne) doit valoir
-- true. Les colonnes précédentes disent quel contrôle a échoué le cas échéant.
-- À appliquer AVANT de merger la PR.
--
-- Retour arrière : bloc commenté en bas du fichier.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 20261010191000_cm87_duo_rpc.sql
-- ---------------------------------------------------------------------------

-- CM-87 : duo optionnel (inviter, rejoindre, quitter, séances perso en duo).
--
-- Règles validées par Antoine le 07/10/2026 (maquettes « Onboarding et duo »,
-- écrans 6 à 13) :
-- - un utilisateur solo invite son partenaire avec un code de 6 caractères
--   (sans 0, O, 1 ni I), valable 7 jours, une seule invitation active ;
-- - l'invité rejoint le duo de celui qui invite et partage SA bibliothèque :
--   les séances types perso de l'invitant passent dans « Nos séances » ;
--   celles de l'invité restent à lui seul ;
-- - même couleur des deux côtés : l'invité en choisit une autre avant
--   d'accepter ;
-- - celui qui quitte garde ses séances, séries, stats et records, et reçoit
--   une COPIE perso des séances types du duo (et des exercices du duo
--   qu'elles ou ses séries utilisent) ; l'autre garde la bibliothèque, qui
--   devient la sienne (le duo, resté à un membre, est dissous) ;
-- - un duo n'existe « vraiment » qu'à deux : celui créé par une invitation en
--   attente n'a qu'un membre, l'app le traite comme solo (lib/profile.ts,
--   getDuoId) et il est dissous si l'invitation est annulée ;
-- - une séance type peut passer de « Mes séances » à « Nos séances » et
--   inversement ; une séance partagée emmène ses exercices perso dans le duo.
--
-- Tout passe par des fonctions SECURITY DEFINER (search_path vide, noms
-- qualifiés) : `authenticated` n'a toujours AUCUN droit d'écriture sur duos,
-- duo_members ni duo_invitations, et aucune policy n'est ajoutée (22 dans
-- public, inchangé). Chaque fonction lit l'appelant dans `auth.uid()`.
--
-- Fonctions appelables (EXECUTE pour `authenticated` seulement) :
--   create_duo_invitation()                    -> (code, token, expires_at)
--   get_my_duo_invitation()                    -> invitation active de mon duo
--   revoke_duo_invitation()
--   get_duo_invitation(p_code)                 -> aperçu pour la confirmation
--   accept_duo_invitation(p_code, p_accent_color default null) -> duo_id
--   leave_duo()
--   set_seance_shared(p_day_id, p_shared)      « Partager » / « Garder pour moi »
--                                              -> (status, day_id)
--
-- Fonctions internes (préfixe cm87_, EXECUTE retiré à tous les rôles
-- clients) : programme perso / partagé, déplacement d'une séance type,
-- passage des exercices perso au duo, dissolution d'un duo à un seul membre,
-- copie perso de la bibliothèque du duo.
--
-- Erreurs : `raise exception 'cm87:<code>'` (errcode P0001), traduites en
-- français côté app (lib/duo.ts) : not_authenticated, duo_full,
-- invitation_invalid, invitation_expired, invitation_self, already_in_duo,
-- color_conflict, color_invalid, not_in_duo, no_partner, seance_not_found,
-- name_taken.
--
-- Vocabulaire du schéma : une « séance type » est une ligne de program_days,
-- rattachée à un programme perso (owner_profile_id) ou du duo (duo_id).
-- Aucune donnée de séance réalisée n'est jamais supprimée : sessions et
-- session_sets ne sont touchées que pour être RATTACHÉES aux copies (même
-- ligne, nouvelle séance type / nouvel exercice).
--
-- Rejouable : `create or replace`, index `if not exists`, droits idempotents.

-- 0. Index ------------------------------------------------------------------------
-- Unicité du code actif : déjà posée par CM-85 (duo_invitations_active_code),
-- réaffirmée ici. Recherche des invitations actives d'un duo.

create unique index if not exists duo_invitations_active_code
  on public.duo_invitations (code)
  where accepted_at is null and revoked_at is null;

create index if not exists duo_invitations_duo_active
  on public.duo_invitations (duo_id)
  where accepted_at is null and revoked_at is null;

-- 1. Fonctions internes -----------------------------------------------------------

-- Alphabet du code : 32 caractères, sans 0, O, 1 ni I (confusions à l'écran).
-- 256 est un multiple de 32 : chaque octet aléatoire donne un caractère
-- uniforme.
create or replace function public.cm87_new_code()
 returns text
 language plpgsql
 volatile
 set search_path to ''
as $function$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(6);
  v_code text := '';
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
  end loop;
  return v_code;
end;
$function$;

-- Programme perso le plus ancien d'un profil, créé (« Mes séances ») au besoin.
create or replace function public.cm87_personal_program(p_profile uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid;
begin
  select id into v_id from public.programs
  where owner_profile_id = p_profile
  order by created_at, id
  limit 1;
  if v_id is null then
    insert into public.programs (name, owner_profile_id, duo_id)
      values ('Mes séances', p_profile, null)
      returning id into v_id;
  end if;
  return v_id;
end;
$function$;

-- Programme du duo le plus ancien, créé (« Nos séances ») au besoin.
create or replace function public.cm87_shared_program(p_duo uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_id uuid;
begin
  select id into v_id from public.programs
  where duo_id = p_duo
  order by created_at, id
  limit 1;
  if v_id is null then
    insert into public.programs (name, owner_profile_id, duo_id)
      values ('Nos séances', null, p_duo)
      returning id into v_id;
  end if;
  return v_id;
end;
$function$;

-- Nom libre dans un programme : `p_name`, sinon « p_name (2) », « (3) »...
create or replace function public.cm87_free_day_name(
  p_program uuid, p_name text, p_exclude uuid default null)
 returns text
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
declare
  v_name text := p_name;
  v_n int := 1;
begin
  while exists (
    select 1 from public.program_days
    where program_id = p_program
      and lower(btrim(name)) = lower(btrim(v_name))
      and (p_exclude is null or id <> p_exclude)
  ) loop
    v_n := v_n + 1;
    v_name := p_name || ' (' || v_n || ')';
  end loop;
  return v_name;
end;
$function$;

-- Déplace une séance type en fin de programme cible. Nom déjà pris : renommée
-- (p_rename) ou refus `cm87:name_taken`. Les séances réalisées dessus restent
-- rattachées (même id de séance type).
create or replace function public.cm87_move_day(
  p_day uuid, p_target uuid, p_rename boolean)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_name text;
  v_free text;
  v_order int;
begin
  select name into v_name from public.program_days where id = p_day;
  v_free := public.cm87_free_day_name(p_target, v_name, p_day);
  if v_free <> v_name and not p_rename then
    raise exception 'cm87:name_taken';
  end if;
  select coalesce(max(order_index) + 1, 0) into v_order
  from public.program_days where program_id = p_target and id <> p_day;
  update public.program_days
    set program_id = p_target, name = v_free, order_index = v_order
    where id = p_day;
end;
$function$;

-- Les exercices perso (d'un membre du duo) utilisés par une séance type
-- deviennent des exercices du duo : sinon le partenaire ne les verrait pas.
create or replace function public.cm87_share_day_exercises(p_day uuid, p_duo uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  update public.exercises e
    set owner_profile_id = null, duo_id = p_duo
    where e.owner_profile_id in (
            select profile_id from public.duo_members where duo_id = p_duo)
      and e.id in (
            select pe.exercise_id from public.program_exercises pe
            where pe.program_day_id = p_day);
end;
$function$;

-- Duo où le profil est SEUL (invitation jamais acceptée, ou partenaire parti) :
-- tout redevient perso (séances types dans son programme perso, exercices du
-- duo à son nom), puis le duo est supprimé (invitations comprises). Rien
-- d'autre que lui ne référence ce duo : aucune donnée perdue.
create or replace function public.cm87_dissolve_solo_duo(p_profile uuid, p_duo uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_target uuid;
  r record;
begin
  -- Verrous (C5) : le duo, puis ses programmes. Une acceptation ou une
  -- création concurrente attend la fin de la dissolution, et le contrôle
  -- « seul dans le duo » ci-dessous est fait sous verrou : la suppression du
  -- duo ne peut jamais emporter en cascade le membre ou la bibliothèque d'un
  -- autre.
  perform 1 from public.duos where id = p_duo for update;
  perform 1 from public.programs where duo_id = p_duo for update;
  if exists (select 1 from public.duo_members
             where duo_id = p_duo and profile_id <> p_profile) then
    raise exception 'cm87:already_in_duo';
  end if;
  update public.exercises
    set duo_id = null, owner_profile_id = p_profile
    where duo_id = p_duo;
  if exists (select 1 from public.programs where duo_id = p_duo) then
    v_target := public.cm87_personal_program(p_profile);
    for r in
      select d.id from public.program_days d
      join public.programs p on p.id = d.program_id
      where p.duo_id = p_duo
      order by p.created_at, d.order_index, d.id
    loop
      perform public.cm87_move_day(r.id, v_target, true);
    end loop;
  end if;
  -- Programmes du duo désormais vides, membre, invitations : en cascade.
  delete from public.duos where id = p_duo;
end;
$function$;

-- Copie perso, pour p_profile, de la bibliothèque du duo (avant qu'il le
-- quitte) :
-- 1. chaque exercice du duo utilisé par une séance type du duo, par une
--    séance type perso de p_profile ou par une de ses séries est copié à son
--    nom (owner_profile_id) ;
-- 2. chaque séance type du duo est copiée (exercices remappés) dans son
--    programme perso, renommée si le nom y est déjà pris ;
-- 3. ses séances réalisées, ses séries et ses séances types perso sont
--    rattachées aux copies (aucune ligne supprimée).
create or replace function public.cm87_copy_duo_library(p_profile uuid, p_duo uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_target uuid;
  v_new uuid;
  v_order int;
  v_ex jsonb := '{}'::jsonb;
  v_day jsonb := '{}'::jsonb;
  r record;
begin
  -- 1. Exercices du duo à copier.
  for r in
    select e.id, e.name, e.muscle_group, e.is_compound
    from public.exercises e
    where e.duo_id = p_duo
      and (
        exists (select 1 from public.program_exercises pe
                join public.program_days d on d.id = pe.program_day_id
                join public.programs p on p.id = d.program_id
                where pe.exercise_id = e.id
                  and (p.duo_id = p_duo or p.owner_profile_id = p_profile))
        or exists (select 1 from public.session_sets ss
                   join public.sessions s on s.id = ss.session_id
                   where ss.exercise_id = e.id and s.profile_id = p_profile)
      )
    order by e.created_at, e.id
  loop
    insert into public.exercises (name, muscle_group, is_compound, duo_id, owner_profile_id)
      values (r.name, r.muscle_group, r.is_compound, null, p_profile)
      returning id into v_new;
    v_ex := v_ex || jsonb_build_object(r.id::text, v_new);
  end loop;

  -- 2. Séances types du duo.
  v_target := public.cm87_personal_program(p_profile);
  select coalesce(max(order_index) + 1, 0) into v_order
  from public.program_days where program_id = v_target;
  for r in
    select d.id, d.name from public.program_days d
    join public.programs p on p.id = d.program_id
    where p.duo_id = p_duo
    order by p.created_at, d.order_index, d.id
  loop
    insert into public.program_days (program_id, name, order_index)
      values (v_target, public.cm87_free_day_name(v_target, r.name), v_order)
      returning id into v_new;
    v_order := v_order + 1;
    v_day := v_day || jsonb_build_object(r.id::text, v_new);
    insert into public.program_exercises
      (program_day_id, exercise_id, order_index, target_sets, target_reps_min,
       target_reps_max, rest_seconds, notes)
      select v_new,
             coalesce((v_ex ->> pe.exercise_id::text)::uuid, pe.exercise_id),
             pe.order_index, pe.target_sets, pe.target_reps_min,
             pe.target_reps_max, pe.rest_seconds, pe.notes
      from public.program_exercises pe
      where pe.program_day_id = r.id;
  end loop;

  -- 3. Rattachements de ce qui appartient à p_profile.
  update public.sessions s
    set program_day_id = (v_day ->> s.program_day_id::text)::uuid
    where s.profile_id = p_profile
      and v_day ? s.program_day_id::text;
  update public.session_sets ss
    set exercise_id = (v_ex ->> ss.exercise_id::text)::uuid
    from public.sessions s
    where s.id = ss.session_id and s.profile_id = p_profile
      and v_ex ? ss.exercise_id::text;
  update public.program_exercises pe
    set exercise_id = (v_ex ->> pe.exercise_id::text)::uuid
    from public.program_days d, public.programs p
    where d.id = pe.program_day_id and p.id = d.program_id
      and p.owner_profile_id = p_profile
      and v_ex ? pe.exercise_id::text;
end;
$function$;

-- 2. Inviter -----------------------------------------------------------------------

-- Crée l'invitation (et le duo de l'appelant s'il n'en a pas). Une seule
-- invitation active par duo : la précédente est révoquée.
create or replace function public.create_duo_invitation()
 returns table (code text, token uuid, expires_at timestamptz)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_duo uuid;
  v_inv public.duo_invitations;
begin
  if v_me is null then raise exception 'cm87:not_authenticated'; end if;

  select duo_id into v_duo from public.duo_members where profile_id = v_me;
  if v_duo is null then
    insert into public.duos (name, created_by) values (null, v_me)
      returning id into v_duo;
    insert into public.duo_members (duo_id, profile_id) values (v_duo, v_me);
  end if;
  perform 1 from public.duos where id = v_duo for update;
  if (select count(*) from public.duo_members where duo_id = v_duo) >= 2 then
    raise exception 'cm87:duo_full';
  end if;

  update public.duo_invitations i
    set revoked_at = now()
    where i.duo_id = v_duo and i.accepted_at is null and i.revoked_at is null;

  for attempt in 1..20 loop
    begin
      insert into public.duo_invitations (duo_id, created_by, code)
        values (v_duo, v_me, public.cm87_new_code())
        returning * into v_inv;
      exit;
    exception when unique_violation then
      if attempt = 20 then raise; end if;
    end;
  end loop;

  return query select v_inv.code, v_inv.token, v_inv.expires_at;
end;
$function$;

-- Invitation active (non expirée) du duo de l'appelant, pour l'afficher
-- « en attente » sur le profil. Aucune ligne sinon.
create or replace function public.get_my_duo_invitation()
 returns table (code text, token uuid, expires_at timestamptz)
 language sql
 stable
 security definer
 set search_path to ''
as $function$
  select i.code, i.token, i.expires_at
  from public.duo_invitations i
  join public.duo_members m on m.duo_id = i.duo_id
  where m.profile_id = (select auth.uid())
    and i.accepted_at is null and i.revoked_at is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1
$function$;

-- Annule l'invitation active du duo de l'appelant (sans effet s'il n'y en a
-- pas). Un duo où l'appelant est seul est dissous : il redevient solo.
create or replace function public.revoke_duo_invitation()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_me uuid := auth.uid();
  v_duo uuid;
begin
  if v_me is null then raise exception 'cm87:not_authenticated'; end if;
  select duo_id into v_duo from public.duo_members where profile_id = v_me;
  if v_duo is null then return; end if;
  update public.duo_invitations
    set revoked_at = now()
    where duo_id = v_duo and accepted_at is null and revoked_at is null;
  if not exists (select 1 from public.duo_members
                 where duo_id = v_duo and profile_id <> v_me) then
    perform public.cm87_dissolve_solo_duo(v_me, v_duo);
  end if;
end;
$function$;

-- 3. Rejoindre ---------------------------------------------------------------------

-- Invitation valide pour ce code (verrouillée), sinon exception.
create or replace function public.cm87_valid_invitation(p_code text, p_me uuid, p_lock boolean)
 returns public.duo_invitations
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_inv public.duo_invitations;
  v_code text := upper(btrim(coalesce(p_code, '')));
begin
  if v_code !~ '^[A-Z0-9]{6}$' then raise exception 'cm87:invitation_invalid'; end if;
  if p_lock then
    select * into v_inv from public.duo_invitations i
      where i.code = v_code and i.accepted_at is null and i.revoked_at is null
      for update;
  else
    select * into v_inv from public.duo_invitations i
      where i.code = v_code and i.accepted_at is null and i.revoked_at is null;
  end if;
  if v_inv.id is null then raise exception 'cm87:invitation_invalid'; end if;
  if v_inv.expires_at <= now() then raise exception 'cm87:invitation_expired'; end if;
  if v_inv.created_by = p_me then raise exception 'cm87:invitation_self'; end if;
  -- L'invitant a quitté ce duo depuis : invitation caduque.
  if not exists (select 1 from public.duo_members
                 where duo_id = v_inv.duo_id and profile_id = v_inv.created_by) then
    raise exception 'cm87:invitation_invalid';
  end if;
  return v_inv;
end;
$function$;

-- Aperçu pour l'écran de confirmation : prénom et couleur de l'invitant,
-- validité, couleur de l'appelant. Rien d'autre.
create or replace function public.get_duo_invitation(p_code text)
 returns table (
   inviter_name text, inviter_color text, expires_at timestamptz,
   my_color text, color_conflict boolean, already_in_duo boolean)
 language plpgsql
 stable
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_inv public.duo_invitations;
  v_inviter public.profiles;
  v_mine public.profiles;
begin
  if v_me is null then raise exception 'cm87:not_authenticated'; end if;
  v_inv := public.cm87_valid_invitation(p_code, v_me, false);
  select * into v_inviter from public.profiles where id = v_inv.created_by;
  select * into v_mine from public.profiles where id = v_me;
  return query select
    v_inviter.display_name, v_inviter.accent_color, v_inv.expires_at,
    v_mine.accent_color, v_mine.accent_color = v_inviter.accent_color,
    exists (select 1 from public.duo_members m1
            join public.duo_members m2 on m2.duo_id = m1.duo_id
            where m1.profile_id = v_me and m2.profile_id <> v_me);
end;
$function$;

-- Rejoint le duo de l'invitant. `p_accent_color` : nouvelle couleur de
-- l'appelant (obligatoire si la sienne est déjà celle de l'invitant).
create or replace function public.accept_duo_invitation(
  p_code text, p_accent_color text default null)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_me uuid := auth.uid();
  v_inv public.duo_invitations;
  v_my_duo uuid;
  v_shared uuid;
  v_color text;
  r record;
begin
  if v_me is null then raise exception 'cm87:not_authenticated'; end if;
  v_inv := public.cm87_valid_invitation(p_code, v_me, true);

  -- Verrous (C5) : le duo de l'invitant et, s'il existe, celui de l'appelant,
  -- toujours dans l'ordre des ids (deux acceptations croisées ne se
  -- bloquent pas mutuellement). Puis contrôles sous verrou.
  select duo_id into v_my_duo from public.duo_members where profile_id = v_me;
  perform 1 from public.duos
    where id in (v_inv.duo_id, v_my_duo)
    order by id
    for update;
  select duo_id into v_my_duo from public.duo_members where profile_id = v_me;

  -- Déjà en duo avec quelqu'un : refus. Seul dans un duo (invitation
  -- envoyée, jamais acceptée) : ce duo est dissous, tout redevient perso.
  if v_my_duo is not null then
    if exists (select 1 from public.duo_members
               where duo_id = v_my_duo and profile_id <> v_me) then
      raise exception 'cm87:already_in_duo';
    end if;
    perform public.cm87_dissolve_solo_duo(v_me, v_my_duo);
  end if;

  if (select count(*) from public.duo_members where duo_id = v_inv.duo_id) >= 2 then
    raise exception 'cm87:duo_full';
  end if;

  -- Couleur : nouvelle couleur demandée, puis plus de conflit avec l'invitant.
  if p_accent_color is not null then
    if p_accent_color not in ('#2FE6FF', '#FF4F7E', '#FF8A3D', '#A78BFA', '#5B8CFF', '#FFD23F') then
      raise exception 'cm87:color_invalid';
    end if;
    update public.profiles set accent_color = p_accent_color where id = v_me;
  end if;
  select accent_color into v_color from public.profiles where id = v_me;
  if v_color = (select accent_color from public.profiles where id = v_inv.created_by) then
    raise exception 'cm87:color_conflict';
  end if;

  insert into public.duo_members (duo_id, profile_id) values (v_inv.duo_id, v_me);

  -- La bibliothèque de l'invitant devient celle du duo : ses séances types
  -- perso passent dans « Nos séances », avec leurs exercices perso. Celles de
  -- l'invité restent perso.
  if exists (select 1 from public.programs where owner_profile_id = v_inv.created_by) then
    v_shared := public.cm87_shared_program(v_inv.duo_id);
    for r in
      select d.id from public.program_days d
      join public.programs p on p.id = d.program_id
      where p.owner_profile_id = v_inv.created_by
      order by p.created_at, d.order_index, d.id
    loop
      perform public.cm87_move_day(r.id, v_shared, true);
      perform public.cm87_share_day_exercises(r.id, v_inv.duo_id);
    end loop;
    delete from public.programs p
      where p.owner_profile_id = v_inv.created_by
        and not exists (select 1 from public.program_days d where d.program_id = p.id);
  end if;

  update public.duo_invitations
    set accepted_by = v_me, accepted_at = now()
    where id = v_inv.id;
  update public.duo_invitations
    set revoked_at = now()
    where duo_id = v_inv.duo_id and accepted_at is null and revoked_at is null;

  return v_inv.duo_id;
end;
$function$;

-- 4. Quitter -----------------------------------------------------------------------

-- L'appelant quitte son duo : copie perso de la bibliothèque du duo, puis il
-- sort de duo_members. Le partenaire garde le duo et sa bibliothèque. Seul
-- dans le duo : dissolution (tout redevient perso, duo supprimé).
create or replace function public.leave_duo()
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_me uuid := auth.uid();
  v_duo uuid;
  v_partner uuid;
begin
  if v_me is null then raise exception 'cm87:not_authenticated'; end if;
  select duo_id into v_duo from public.duo_members where profile_id = v_me;
  if v_duo is null then raise exception 'cm87:not_in_duo'; end if;
  perform 1 from public.duos where id = v_duo for update;

  if not exists (select 1 from public.duo_members
                 where duo_id = v_duo and profile_id <> v_me) then
    perform public.cm87_dissolve_solo_duo(v_me, v_duo);
    return;
  end if;

  select profile_id into v_partner from public.duo_members
    where duo_id = v_duo and profile_id <> v_me;

  perform public.cm87_copy_duo_library(v_me, v_duo);
  delete from public.duo_members where duo_id = v_duo and profile_id = v_me;

  -- Le partenaire reste seul : sa bibliothèque (celle du duo, mêmes lignes,
  -- mêmes ids) devient sa bibliothèque perso et le duo est supprimé
  -- (invitations comprises). Revenir à deux passe par une nouvelle invitation.
  perform public.cm87_dissolve_solo_duo(v_partner, v_duo);
end;
$function$;

-- 5. Partager / garder pour moi ---------------------------------------------------

-- p_shared = true : séance type perso -> « Nos séances » (ses exercices perso
-- deviennent ceux du duo). p_shared = false : séance du duo -> « Mes
-- séances ».
--
-- Exception (C1) : une séance du duo sur laquelle le PARTENAIRE a déjà une
-- séance (en cours ou passée) n'est pas déplacée : il ne pourrait plus
-- l'ouvrir, ni la terminer (sessions_update_self exige une séance type
-- accessible), et son historique perdrait le nom. L'appelant en reçoit une
-- COPIE dans « Mes séances » (même nom, mêmes exercices) ; l'original reste
-- dans « Nos séances ». Les exercices du duo utilisés restent visibles tant
-- qu'il est en duo (et seront copiés à son nom s'il le quitte, leave_duo).
--
-- Résultat : status = 'moved' (déplacée), 'copied' (copie perso créée,
-- day_id = la copie) ou 'unchanged' (déjà du bon côté). Nom déjà pris dans
-- la bibliothèque d'arrivée : cm87:name_taken, avant tout changement.
drop function if exists public.set_seance_shared(uuid, boolean);
create or replace function public.set_seance_shared(p_day_id uuid, p_shared boolean)
 returns table (status text, day_id uuid)
 language plpgsql
 security definer
 set search_path to ''
as $function$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_duo uuid;
  v_prog public.programs;
  v_day public.program_days;
  v_target uuid;
  v_copy uuid;
  v_order int;
begin
  if v_me is null then raise exception 'cm87:not_authenticated'; end if;
  select p.* into v_prog
    from public.program_days d join public.programs p on p.id = d.program_id
    where d.id = p_day_id;
  if v_prog.id is null or not public.can_access_program(v_prog.id) then
    raise exception 'cm87:seance_not_found';
  end if;

  select duo_id into v_duo from public.duo_members where profile_id = v_me;
  if v_duo is null then raise exception 'cm87:not_in_duo'; end if;
  perform 1 from public.duos where id = v_duo for update;
  if not exists (select 1 from public.duo_members
                 where duo_id = v_duo and profile_id <> v_me) then
    raise exception 'cm87:no_partner';
  end if;
  select * into v_day from public.program_days where id = p_day_id for update;

  if p_shared then
    if v_prog.owner_profile_id is distinct from v_me then
      return query select 'unchanged'::text, p_day_id;
      return;
    end if;
    perform public.cm87_move_day(p_day_id, public.cm87_shared_program(v_duo), false);
    perform public.cm87_share_day_exercises(p_day_id, v_duo);
    delete from public.programs p
      where p.id = v_prog.id
        and not exists (select 1 from public.program_days d where d.program_id = p.id)
        and exists (select 1 from public.programs o
                    where o.owner_profile_id = v_me and o.id <> p.id);
    return query select 'moved'::text, p_day_id;
    return;
  end if;

  if v_prog.duo_id is distinct from v_duo then
    return query select 'unchanged'::text, p_day_id;
    return;
  end if;

  v_target := public.cm87_personal_program(v_me);

  if not exists (select 1 from public.sessions s
                 where s.program_day_id = p_day_id and s.profile_id <> v_me) then
    perform public.cm87_move_day(p_day_id, v_target, false);
    return query select 'moved'::text, p_day_id;
    return;
  end if;

  -- Le partenaire l'a déjà utilisée : copie perso, l'original reste au duo.
  if public.cm87_free_day_name(v_target, v_day.name) <> v_day.name then
    raise exception 'cm87:name_taken';
  end if;
  select coalesce(max(order_index) + 1, 0) into v_order
    from public.program_days where program_id = v_target;
  insert into public.program_days (program_id, name, order_index)
    values (v_target, v_day.name, v_order)
    returning id into v_copy;
  insert into public.program_exercises
    (program_day_id, exercise_id, order_index, target_sets, target_reps_min,
     target_reps_max, rest_seconds, notes)
    select v_copy, pe.exercise_id, pe.order_index, pe.target_sets,
           pe.target_reps_min, pe.target_reps_max, pe.rest_seconds, pe.notes
    from public.program_exercises pe
    where pe.program_day_id = p_day_id;
  return query select 'copied'::text, v_copy;
end;
$function$;

-- 6. Droits -------------------------------------------------------------------------
-- EXECUTE à PUBLIC est un défaut global de PostgreSQL (voir CM-59) : revoke
-- explicite pour chaque fonction. Internes : aucun rôle client.

revoke all on function
  public.cm87_new_code(),
  public.cm87_personal_program(uuid),
  public.cm87_shared_program(uuid),
  public.cm87_free_day_name(uuid, text, uuid),
  public.cm87_move_day(uuid, uuid, boolean),
  public.cm87_share_day_exercises(uuid, uuid),
  public.cm87_dissolve_solo_duo(uuid, uuid),
  public.cm87_copy_duo_library(uuid, uuid),
  public.cm87_valid_invitation(text, uuid, boolean)
  from public, anon, authenticated, service_role;

revoke all on function
  public.create_duo_invitation(),
  public.get_my_duo_invitation(),
  public.revoke_duo_invitation(),
  public.get_duo_invitation(text),
  public.accept_duo_invitation(text, text),
  public.leave_duo(),
  public.set_seance_shared(uuid, boolean)
  from public, anon, service_role;

grant execute on function
  public.create_duo_invitation(),
  public.get_my_duo_invitation(),
  public.revoke_duo_invitation(),
  public.get_duo_invitation(text),
  public.accept_duo_invitation(text, text),
  public.leave_duo(),
  public.set_seance_shared(uuid, boolean)
  to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Vérification (lecture seule). Une ligne, dernière colonne `ok` = true.
-- ---------------------------------------------------------------------------

with rpc as (
  select p.proname, p.prosecdef, p.proconfig, p.oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_duo_invitation', 'get_my_duo_invitation',
                      'revoke_duo_invitation', 'get_duo_invitation',
                      'accept_duo_invitation', 'leave_duo', 'set_seance_shared')
),
internes as (
  select p.oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname like 'cm87\_%'
),
v as (
  select
    (select count(*) from rpc) = 7 as rpc_presentes,
    (select bool_and(prosecdef and proconfig @> array['search_path=""']) from rpc)
      as rpc_definer_search_path,
    (select bool_and(has_function_privilege('authenticated', oid, 'execute')
                     and not has_function_privilege('anon', oid, 'execute'))
     from rpc) as rpc_authenticated_seulement,
    (select count(*) from internes) = 9
      and (select bool_and(not has_function_privilege('authenticated', oid, 'execute')
                           and not has_function_privilege('anon', oid, 'execute'))
           from internes) as internes_fermees,
    (select count(*) from pg_policies where schemaname = 'public') = 22 as policies_22,
    not has_table_privilege('authenticated', 'public.duo_invitations', 'select')
      and not has_table_privilege('authenticated', 'public.duo_members', 'insert')
      and not has_table_privilege('authenticated', 'public.duos', 'insert')
      as duo_tables_sans_ecriture,
    exists (select 1 from pg_indexes where schemaname = 'public'
            and indexname = 'duo_invitations_active_code') as index_code_actif,
    (select count(*) from public.duo_members
     where duo_id = '33333333-3333-3333-3333-333333333333') = 2 as duo_antoine_lea_intact,
    public.cm87_new_code() ~ '^[A-HJ-NP-Z2-9]{6}$' as code_au_bon_format
)
select
  *,
  (rpc_presentes and rpc_definer_search_path and rpc_authenticated_seulement
   and internes_fermees and policies_22 and duo_tables_sans_ecriture
   and index_code_actif and duo_antoine_lea_intact and code_au_bon_format) as ok
from v;

-- ============================================================================
-- RETOUR ARRIÈRE (à décommenter et coller seul, en cas de besoin).
--
-- Retire les RPC et l'index : l'app de CM-87 ne peut plus inviter, rejoindre,
-- quitter ni partager une séance (l'app d'avant CM-87 n'en a pas besoin).
-- Les duos, invitations, séances et séries déjà créés restent en place.
-- ============================================================================
--
-- begin;
--
-- drop function if exists public.create_duo_invitation();
-- drop function if exists public.get_my_duo_invitation();
-- drop function if exists public.revoke_duo_invitation();
-- drop function if exists public.get_duo_invitation(text);
-- drop function if exists public.accept_duo_invitation(text, text);
-- drop function if exists public.leave_duo();
-- drop function if exists public.set_seance_shared(uuid, boolean);
-- drop function if exists public.cm87_valid_invitation(text, uuid, boolean);
-- drop function if exists public.cm87_copy_duo_library(uuid, uuid);
-- drop function if exists public.cm87_dissolve_solo_duo(uuid, uuid);
-- drop function if exists public.cm87_share_day_exercises(uuid, uuid);
-- drop function if exists public.cm87_move_day(uuid, uuid, boolean);
-- drop function if exists public.cm87_free_day_name(uuid, text, uuid);
-- drop function if exists public.cm87_shared_program(uuid);
-- drop function if exists public.cm87_personal_program(uuid);
-- drop function if exists public.cm87_new_code();
-- drop index if exists public.duo_invitations_duo_active;
-- -- duo_invitations_active_code vient de CM-85 : conservé.
--
-- commit;
--
-- Puis, si le migration repair a été fait :
--   npx supabase migration repair --status reverted 20261010191000
