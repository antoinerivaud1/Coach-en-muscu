-- CM-59 livraison A (« schéma ») : droits au plus juste.
--
-- Jusqu'ici : ALL (dont TRUNCATE, REFERENCES, TRIGGER) pour anon ET
-- authenticated sur les tables historiques (baseline, comme la prod). Après :
-- - anon : plus rien dans le schéma public (tables, séquences, fonctions) ;
-- - authenticated : uniquement ce que les policies de
--   20261010090000_cm59_rls_policies.sql encadrent :
--     profiles           select + update (display_name, weekly_goal, color_role)
--     duos, duo_members  select
--     exercises, programs, program_days, program_exercises, sessions,
--     session_sets       select, insert, update, delete
--     couples, couple_members, duo_invitations : rien
--   et EXECUTE seulement sur les 4 helpers RLS ;
-- - service_role : inchangé (l'app passe par elle, CM-17).
--
-- Les triggers (on_auth_user_created, programs_sync_duo, exercises_sync_duo,
-- couples_sync_duos, couple_members_sync_duo_members, duo_members_max_two)
-- continuent de fonctionner : PostgreSQL ne vérifie pas EXECUTE sur la
-- fonction d'un trigger quand il se déclenche (seulement à sa création).
-- Prouvé par supabase/tests/rls.test.sql (cas 11, 16 et 17).
--
-- Rejouable : revoke / grant sont idempotents.

-- 1. anon : plus rien ---------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;

-- 2. authenticated : tables ---------------------------------------------------------

revoke truncate, references, trigger on all tables in schema public from authenticated;

-- PostgreSQL 17 (prod et CI) : MAINTAIN (vacuum, analyze, lock...) fait
-- partie de ALL. Retiré aussi ; conditionnel pour rester exécutable en 15/16.
do $$
begin
  if current_setting('server_version_num')::int >= 170000 then
    execute 'revoke maintain on all tables in schema public from authenticated';
  end if;
end
$$;

-- profiles : lecture, et mise à jour des seules colonnes éditables. Le revoke
-- de UPDATE au niveau table retire aussi les droits colonne : il passe AVANT
-- le grant colonne.
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, weekly_goal, color_role) on public.profiles to authenticated;

-- duos / duo_members : lecture seule. duo_invitations : rien.
revoke all on public.duos, public.duo_members, public.duo_invitations from authenticated;
grant select on public.duos, public.duo_members to authenticated;

grant select, insert, update, delete on
  public.exercises, public.programs, public.program_days,
  public.program_exercises, public.sessions, public.session_sets
  to authenticated;

-- Modèle couple : plus aucun accès hors service-role.
revoke all on public.couples, public.couple_members from authenticated;

-- 3. Fonctions ------------------------------------------------------------------------

revoke execute on all functions in schema public from public, anon;
-- Au-delà du cadrage : authenticated perd aussi EXECUTE partout (aucune RPC
-- n'est appelée par un client connecté) puis le récupère sur les 4 helpers.
revoke execute on all functions in schema public from authenticated;
grant execute on function
  public.my_duo_id(), public.is_duo_member(uuid),
  public.visible_profile_ids(), public.can_access_program(uuid)
  to authenticated;

-- 4. Privilèges par défaut (objets créés plus tard par le rôle courant) -------------
-- NB : pour les fonctions, EXECUTE à PUBLIC est un défaut GLOBAL de
-- PostgreSQL qu'un défaut par schéma ne peut pas retirer : chaque nouvelle
-- fonction doit toujours faire son `revoke ... from public` explicite.

alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon;
