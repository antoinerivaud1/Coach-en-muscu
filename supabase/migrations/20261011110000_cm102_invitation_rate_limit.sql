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
-- l'appelant a déjà vu l'aperçu (ligne de succès sur une invitation de ce
-- code, ce que fait toujours l'écran de confirmation). Ce contrôle passe
-- AVANT toute validation du code : sans aperçu, la réponse est toujours
-- `cm87:invitation_invalid` (le même message qu'un code inconnu), que le code
-- soit inconnu, expiré, révoqué ou valide. Ensuite seulement, les contrôles
-- de CM-87 (expiré, révoqué, le sien...) à l'identique, puis l'aperçu doit
-- porter sur CETTE invitation (pas une ancienne au même code).
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

  -- CM-102 : seulement un code dont l'appelant a vu l'aperçu, vérifié AVANT
  -- toute validation du code. Même erreur qu'un code inconnu : rien n'est
  -- révélé (ni inconnu, ni expiré, ni révoqué, ni valide).
  if not exists (select 1 from public.duo_invitation_attempts a
                 join public.duo_invitations i on i.id = a.invitation_id
                 where a.profile_id = v_me and a.success
                   and i.code = upper(btrim(coalesce(p_code, '')))) then
    raise exception 'cm87:invitation_invalid';
  end if;

  v_inv := public.cm87_valid_invitation(p_code, v_me, true);

  -- L'aperçu doit porter sur CETTE invitation (une ancienne invitation au
  -- même code, vue autrefois, ne suffit pas).
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
