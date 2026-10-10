-- ============================================================================
-- CM-102 : limite d'essais des codes d'invitation duo. Fichier UNIQUE à coller
-- dans Supabase, SQL Editor (PROD, projet coach-en-muscu).
--
-- Contenu = la migration du repo, À L'IDENTIQUE, dans une transaction :
--   supabase/migrations/20261011110000_cm102_invitation_rate_limit.sql
-- Si une instruction échoue, rien n'est appliqué (rollback automatique).
-- Rejouable : `create table / index if not exists`, `create or replace`,
-- droits idempotents. Le rejouer une 2e fois ne change rien.
--
-- Prérequis : CM-87 appliqué (ops/2026-10-cm87-duo-rpc.sql : RPC du duo et
-- fonctions internes cm87_*).
--
-- Seuils : 10 échecs dans la dernière heure, ou 30 dans les dernières 24 h,
-- par compte, puis `cm102:too_many_attempts`. Lignes purgées après 7 jours.
--
-- Sans interruption, inerte pour l'usage actuel : ajoute une table vide
-- (privée : RLS, aucune policy, aucun droit client) et une fonction interne,
-- remplace get_duo_invitation et accept_duo_invitation (mêmes signatures,
-- mêmes droits). Ne modifie aucune ligne existante, aucune policy (22),
-- aucun droit sur les autres tables. Antoine et Léa (duo 3333…, déjà à deux)
-- ne passent jamais par ces RPC : rien ne change pour eux. Les invitations
-- en cours restent valables, le lien /duo/rejoindre?code=… aussi.
--
-- À appliquer AVANT de merger la PR : l'app actuelle (CM-87) reste
-- compatible (elle traite déjà « aucune ligne » comme un code invalide et
-- passe toujours par l'aperçu avant de rejoindre).
--
-- La dernière requête renvoie UNE ligne : `ok` (dernière colonne) doit valoir
-- true. Les colonnes précédentes disent quel contrôle a échoué le cas échéant.
--
-- Retour arrière : bloc commenté en bas du fichier.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 20261011110000_cm102_invitation_rate_limit.sql
-- ---------------------------------------------------------------------------

-- CM-102 : limiter les essais de codes d'invitation duo (force brute) avant
-- l'ouverture publique.
--
-- Avant : get_duo_invitation(p_code) et accept_duo_invitation(p_code, …)
-- (CM-87) acceptent un nombre illimité d'essais. Un code fait 6 caractères
-- sur un alphabet de 32 (environ 1,07 milliard de combinaisons), valable
-- 7 jours, et l'aperçu révèle le prénom et la couleur de l'invitant.
--
-- Après :
-- - chaque échec de l'aperçu (code mal formé, inconnu, expiré, révoqué, déjà
--   utilisé, invitant parti) est enregistré dans public.duo_invitation_attempts
--   (table privée : RLS activée, aucune policy, aucun droit pour anon ni
--   authenticated) ;
-- - avant toute recherche du code, get_duo_invitation et accept_duo_invitation
--   refusent l'appelant qui a 10 échecs ou plus dans la dernière heure, ou 30
--   ou plus dans les dernières 24 h : `cm102:too_many_attempts` (P0001), qui
--   ne dit rien du code. Seuils : constantes en tête de
--   cm102_check_invitation_attempts() ;
-- - un succès est enregistré aussi (avec l'id de l'invitation, jamais le
--   code) : il n'efface pas l'historique et ne compte pas comme échec ;
-- - lignes de plus de 7 jours purgées à chaque appel.
--
-- Pourquoi l'aperçu ne LÈVE plus d'erreur sur un mauvais code : une
-- exception annule la transaction (PostgREST fait un ROLLBACK), donc la ligne
-- d'échec avec. Pour que l'échec soit compté, get_duo_invitation renvoie
-- désormais ZÉRO ligne pour un code inconnu, expiré, révoqué ou déjà utilisé
-- (l'app traitait déjà « aucune ligne » comme `cm87:invitation_invalid`,
-- lib/queries/duo.ts). Les autres erreurs (non connecté, son propre code)
-- sont levées comme avant.
--
-- Pourquoi accept_duo_invitation exige un aperçu réussi : pour la même
-- raison, ses refus ne peuvent pas être comptés. Sans garde, elle servirait
-- d'oracle illimité (code inconnu = invitation_invalid, code valide = succès
-- ou color_conflict / already_in_duo). Elle n'accepte donc qu'un code dont
-- l'appelant a déjà vu l'aperçu (ligne de succès sur cette invitation, ce
-- que fait toujours l'écran de confirmation). Sinon : `cm87:invitation_invalid`,
-- le même message qu'un code inconnu. Les contrôles de CM-87 (code inconnu,
-- expiré, révoqué, le sien) restent faits avant, à l'identique.
--
-- Concurrence : verrou consultatif par appelant (pg_advisory_xact_lock) le
-- temps de la transaction : des appels parallèles du même compte passent
-- l'un après l'autre et ne peuvent pas dépasser le seuil en rafale.
--
-- Inchangé : format et alphabet du code, durée de validité, lien
-- /duo/rejoindre?code=…, invitations en cours, signatures et droits des RPC
-- (EXECUTE pour authenticated seulement), 22 policies, aucune donnée de
-- séance touchée.
--
-- Rejouable : `create table / index if not exists`, `create or replace`,
-- droits idempotents.

-- 1. Table privée des essais -------------------------------------------------------

create table if not exists public.duo_invitation_attempts (
  id            uuid primary key default gen_random_uuid(),
  -- Compte supprimé (CM-60) : ses essais partent avec lui.
  profile_id    uuid not null references public.profiles (id) on delete cascade,
  -- Succès : l'invitation vue dans l'aperçu (jamais le code). Échec : null.
  invitation_id uuid references public.duo_invitations (id) on delete set null,
  success       boolean not null,
  attempted_at  timestamptz not null default now()
);

alter table public.duo_invitation_attempts enable row level security;

-- Aucune policy : seules les fonctions security definer ci-dessous y
-- accèdent. Les privilèges par défaut du schéma public donnent des droits à
-- authenticated sur toute nouvelle table : retirés explicitement.
revoke all on table public.duo_invitation_attempts from public, anon, authenticated;

create index if not exists duo_invitation_attempts_profile_time
  on public.duo_invitation_attempts (profile_id, attempted_at);
-- Purge (lignes de plus de 7 jours, tous comptes).
create index if not exists duo_invitation_attempts_time
  on public.duo_invitation_attempts (attempted_at);
-- Clé étrangère vers duo_invitations (suppression d'un duo en cascade).
create index if not exists duo_invitation_attempts_invitation
  on public.duo_invitation_attempts (invitation_id)
  where invitation_id is not null;

-- 2. Garde ---------------------------------------------------------------------------

-- Refuse l'appelant au-delà des seuils (`cm102:too_many_attempts`), avant
-- toute recherche du code. Purge au passage les lignes trop anciennes.
create or replace function public.cm102_check_invitation_attempts(p_me uuid)
 returns void
 language plpgsql
 volatile
 security definer
 set search_path to ''
as $function$
declare
  -- Seuils (échecs comptés par compte, fenêtres glissantes).
  c_max_per_hour constant int := 10;
  c_max_per_day  constant int := 30;
  c_retention    constant interval := interval '7 days';
  v_hour int;
  v_day int;
begin
  -- Un appel à la fois par compte : pas de rafale parallèle sous le seuil.
  perform pg_advisory_xact_lock(hashtextextended('cm102:' || p_me::text, 0));

  delete from public.duo_invitation_attempts
    where attempted_at < now() - c_retention;

  select count(*) filter (where a.attempted_at > now() - interval '1 hour'),
         count(*)
    into v_hour, v_day
    from public.duo_invitation_attempts a
    where a.profile_id = p_me
      and not a.success
      and a.attempted_at > now() - interval '24 hours';

  if v_hour >= c_max_per_hour or v_day >= c_max_per_day then
    raise exception 'cm102:too_many_attempts';
  end if;
end;
$function$;

-- 3. Aperçu ---------------------------------------------------------------------------

-- Comme CM-87 (prénom et couleur de l'invitant, validité, couleur de
-- l'appelant), avec la garde et l'enregistrement de l'essai. Code inconnu,
-- expiré, révoqué ou déjà utilisé : AUCUNE ligne (l'échec est enregistré).
-- Volatile (écrit) : n'est plus `stable`.
create or replace function public.get_duo_invitation(p_code text)
 returns table (
   inviter_name text, inviter_color text, expires_at timestamptz,
   my_color text, color_conflict boolean, already_in_duo boolean)
 language plpgsql
 volatile
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
  perform public.cm102_check_invitation_attempts(v_me);

  begin
    v_inv := public.cm87_valid_invitation(p_code, v_me, false);
  exception when raise_exception then
    if sqlerrm not in ('cm87:invitation_invalid', 'cm87:invitation_expired') then
      raise;
    end if;
    insert into public.duo_invitation_attempts (profile_id, invitation_id, success)
      values (v_me, null, false);
    return;
  end;

  insert into public.duo_invitation_attempts (profile_id, invitation_id, success)
    values (v_me, v_inv.id, true);

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

-- 4. Rejoindre ------------------------------------------------------------------------

-- Comme CM-87, avec la garde en tête et l'aperçu réussi exigé (voir en-tête).
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
  perform public.cm102_check_invitation_attempts(v_me);
  v_inv := public.cm87_valid_invitation(p_code, v_me, true);

  -- CM-102 : seulement un code dont l'appelant a vu l'aperçu. Même erreur
  -- qu'un code inconnu : rien n'est révélé sur le code.
  if not exists (select 1 from public.duo_invitation_attempts a
                 where a.profile_id = v_me and a.invitation_id = v_inv.id
                   and a.success) then
    raise exception 'cm87:invitation_invalid';
  end if;

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

-- 5. Droits -------------------------------------------------------------------------
-- EXECUTE à PUBLIC est un défaut global de PostgreSQL (voir CM-59) : revoke
-- explicite. Garde interne : aucun rôle client. RPC : authenticated seulement
-- (inchangé, réaffirmé).

revoke all on function public.cm102_check_invitation_attempts(uuid)
  from public, anon, authenticated, service_role;

revoke all on function
  public.get_duo_invitation(text),
  public.accept_duo_invitation(text, text)
  from public, anon, service_role;

grant execute on function
  public.get_duo_invitation(text),
  public.accept_duo_invitation(text, text)
  to authenticated;

commit;

-- ---------------------------------------------------------------------------
-- Vérification (lecture seule). Une ligne, dernière colonne `ok` = true.
-- ---------------------------------------------------------------------------

with rpc as (
  select p.proname, p.prosecdef, p.proconfig, p.provolatile, p.oid
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_duo_invitation', 'get_my_duo_invitation',
                      'revoke_duo_invitation', 'get_duo_invitation',
                      'accept_duo_invitation', 'leave_duo', 'set_seance_shared')
),
garde as (
  select p.oid, p.prosecdef, p.proconfig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'cm102_check_invitation_attempts'
),
v as (
  select
    to_regclass('public.duo_invitation_attempts') is not null as table_presente,
    coalesce((select relrowsecurity from pg_class
              where oid = to_regclass('public.duo_invitation_attempts')), false)
      as rls_activee,
    not exists (select 1 from pg_policies
                where schemaname = 'public' and tablename = 'duo_invitation_attempts')
      as aucune_policy_essais,
    not exists (select 1 from information_schema.role_table_grants
                where table_schema = 'public' and table_name = 'duo_invitation_attempts'
                  and grantee in ('anon', 'authenticated', 'PUBLIC'))
      as aucun_droit_client_essais,
    (select count(*) from garde) = 1
      and (select bool_and(prosecdef and proconfig @> array['search_path=""']
                           and not has_function_privilege('authenticated', oid, 'execute')
                           and not has_function_privilege('anon', oid, 'execute'))
           from garde) as garde_fermee,
    (select count(*) from rpc) = 7 as rpc_presentes,
    (select bool_and(prosecdef and proconfig @> array['search_path=""']) from rpc)
      as rpc_definer_search_path,
    (select bool_and(has_function_privilege('authenticated', oid, 'execute')
                     and not has_function_privilege('anon', oid, 'execute'))
     from rpc) as rpc_authenticated_seulement,
    (select provolatile = 'v' from rpc where proname = 'get_duo_invitation')
      as apercu_volatile,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'cm87\_%') = 9 as internes_cm87,
    (select count(*) from pg_policies where schemaname = 'public') = 22 as policies_22,
    (select count(*) from public.duo_members
     where duo_id = '33333333-3333-3333-3333-333333333333') = 2 as duo_antoine_lea_intact,
    (select count(*) from public.sessions) >= 10 as sessions_10,
    (select count(*) from public.session_sets) >= 190 as session_sets_190,
    (select count(*) from public.exercises) >= 81 as exercises_81
)
select
  *,
  (table_presente and rls_activee and aucune_policy_essais
   and aucun_droit_client_essais and garde_fermee and rpc_presentes
   and rpc_definer_search_path and rpc_authenticated_seulement
   and apercu_volatile and internes_cm87 and policies_22
   and duo_antoine_lea_intact and sessions_10 and session_sets_190
   and exercises_81) as ok
from v;

-- ============================================================================
-- RETOUR ARRIÈRE (à décommenter et coller seul, en cas de besoin).
--
-- Remet get_duo_invitation et accept_duo_invitation de CM-87 (copie exacte
-- de supabase/migrations/20261010191000_cm87_duo_rpc.sql), puis supprime la
-- garde et la table des essais (son contenu n'a pas d'autre usage). Plus
-- aucune limite d'essais ensuite. Aucune autre donnée touchée.
-- ============================================================================
--
-- begin;
--
-- -- Aperçu pour l'écran de confirmation : prénom et couleur de l'invitant,
-- -- validité, couleur de l'appelant. Rien d'autre.
-- create or replace function public.get_duo_invitation(p_code text)
--  returns table (
--    inviter_name text, inviter_color text, expires_at timestamptz,
--    my_color text, color_conflict boolean, already_in_duo boolean)
--  language plpgsql
--  stable
--  security definer
--  set search_path to ''
-- as $function$
-- #variable_conflict use_column
-- declare
--   v_me uuid := auth.uid();
--   v_inv public.duo_invitations;
--   v_inviter public.profiles;
--   v_mine public.profiles;
-- begin
--   if v_me is null then raise exception 'cm87:not_authenticated'; end if;
--   v_inv := public.cm87_valid_invitation(p_code, v_me, false);
--   select * into v_inviter from public.profiles where id = v_inv.created_by;
--   select * into v_mine from public.profiles where id = v_me;
--   return query select
--     v_inviter.display_name, v_inviter.accent_color, v_inv.expires_at,
--     v_mine.accent_color, v_mine.accent_color = v_inviter.accent_color,
--     exists (select 1 from public.duo_members m1
--             join public.duo_members m2 on m2.duo_id = m1.duo_id
--             where m1.profile_id = v_me and m2.profile_id <> v_me);
-- end;
-- $function$;
--
-- -- Rejoint le duo de l'invitant. `p_accent_color` : nouvelle couleur de
-- -- l'appelant (obligatoire si la sienne est déjà celle de l'invitant).
-- create or replace function public.accept_duo_invitation(
--   p_code text, p_accent_color text default null)
--  returns uuid
--  language plpgsql
--  security definer
--  set search_path to ''
-- as $function$
-- declare
--   v_me uuid := auth.uid();
--   v_inv public.duo_invitations;
--   v_my_duo uuid;
--   v_shared uuid;
--   v_color text;
--   r record;
-- begin
--   if v_me is null then raise exception 'cm87:not_authenticated'; end if;
--   v_inv := public.cm87_valid_invitation(p_code, v_me, true);
--
--   -- Verrous (C5) : le duo de l'invitant et, s'il existe, celui de l'appelant,
--   -- toujours dans l'ordre des ids (deux acceptations croisées ne se
--   -- bloquent pas mutuellement). Puis contrôles sous verrou.
--   select duo_id into v_my_duo from public.duo_members where profile_id = v_me;
--   perform 1 from public.duos
--     where id in (v_inv.duo_id, v_my_duo)
--     order by id
--     for update;
--   select duo_id into v_my_duo from public.duo_members where profile_id = v_me;
--
--   -- Déjà en duo avec quelqu'un : refus. Seul dans un duo (invitation
--   -- envoyée, jamais acceptée) : ce duo est dissous, tout redevient perso.
--   if v_my_duo is not null then
--     if exists (select 1 from public.duo_members
--                where duo_id = v_my_duo and profile_id <> v_me) then
--       raise exception 'cm87:already_in_duo';
--     end if;
--     perform public.cm87_dissolve_solo_duo(v_me, v_my_duo);
--   end if;
--
--   if (select count(*) from public.duo_members where duo_id = v_inv.duo_id) >= 2 then
--     raise exception 'cm87:duo_full';
--   end if;
--
--   -- Couleur : nouvelle couleur demandée, puis plus de conflit avec l'invitant.
--   if p_accent_color is not null then
--     if p_accent_color not in ('#2FE6FF', '#FF4F7E', '#FF8A3D', '#A78BFA', '#5B8CFF', '#FFD23F') then
--       raise exception 'cm87:color_invalid';
--     end if;
--     update public.profiles set accent_color = p_accent_color where id = v_me;
--   end if;
--   select accent_color into v_color from public.profiles where id = v_me;
--   if v_color = (select accent_color from public.profiles where id = v_inv.created_by) then
--     raise exception 'cm87:color_conflict';
--   end if;
--
--   insert into public.duo_members (duo_id, profile_id) values (v_inv.duo_id, v_me);
--
--   -- La bibliothèque de l'invitant devient celle du duo : ses séances types
--   -- perso passent dans « Nos séances », avec leurs exercices perso. Celles de
--   -- l'invité restent perso.
--   if exists (select 1 from public.programs where owner_profile_id = v_inv.created_by) then
--     v_shared := public.cm87_shared_program(v_inv.duo_id);
--     for r in
--       select d.id from public.program_days d
--       join public.programs p on p.id = d.program_id
--       where p.owner_profile_id = v_inv.created_by
--       order by p.created_at, d.order_index, d.id
--     loop
--       perform public.cm87_move_day(r.id, v_shared, true);
--       perform public.cm87_share_day_exercises(r.id, v_inv.duo_id);
--     end loop;
--     delete from public.programs p
--       where p.owner_profile_id = v_inv.created_by
--         and not exists (select 1 from public.program_days d where d.program_id = p.id);
--   end if;
--
--   update public.duo_invitations
--     set accepted_by = v_me, accepted_at = now()
--     where id = v_inv.id;
--   update public.duo_invitations
--     set revoked_at = now()
--     where duo_id = v_inv.duo_id and accepted_at is null and revoked_at is null;
--
--   return v_inv.duo_id;
-- end;
-- $function$;
--
--
-- revoke all on function
--   public.get_duo_invitation(text),
--   public.accept_duo_invitation(text, text)
--   from public, anon, service_role;
-- grant execute on function
--   public.get_duo_invitation(text),
--   public.accept_duo_invitation(text, text)
--   to authenticated;
--
-- drop function if exists public.cm102_check_invitation_attempts(uuid);
-- drop table if exists public.duo_invitation_attempts;
--
-- commit;
--
-- Puis, si le migration repair a été fait :
--   npx supabase migration repair --status reverted 20261011110000
