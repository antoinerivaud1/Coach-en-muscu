-- CM-58 (M1 du cadrage, partie auth) : trigger `on_auth_user_created`
-- compatible avec des comptes Auth créés sur un id de profil existant.
--
-- Pourquoi : les comptes d'Antoine et de Léa seront créés via l'API admin
-- (`auth.admin.createUser`) avec `id` = id de leur profil actuel
-- (11111111-… et 22222222-…), pour que `profiles.id = auth.users.id` sans
-- déplacer aucune donnée. L'ancienne `handle_new_user()` fait un `insert`
-- sans `on conflict` : la création échouerait sur la clé primaire de
-- `profiles` (« Database error creating new user »).
--
-- Ce que ça change :
-- - profil déjà présent pour cet id : on ne touche à rien (`on conflict do
--   nothing`), le profil existant (nom, couleur, objectif) est conservé ;
-- - futur inscrit (id aléatoire) : un profil est toujours créé, comme avant
--   (nom = `display_name` des métadonnées, sinon début de l'email, sinon
--   « Moi » ; couleur `toi` sauf métadonnée `color_role` valide). Une
--   métadonnée `color_role` invalide ne fait plus échouer l'inscription.
-- - `search_path` vide et noms qualifiés (bonne pratique SECURITY DEFINER).
--
-- Idempotente : `create or replace function` + trigger recréé à l'identique.
-- Les droits d'exécution (service_role seulement, baseline) sont conservés
-- par `create or replace` et réaffirmés en fin de fichier.
--
-- NE PAS appliquer depuis le code ni depuis la CI : Antoine (ou Claude PM avec
-- son accord) l'applique en prod via Supabase, étape 1 de
-- supabase/ops/2026-10-cm58-bascule.md. Le code de CM-58 fonctionne sans
-- tant que AUTH_MODE=cookie.

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_role text := new.raw_user_meta_data->>'color_role';
begin
  insert into public.profiles (id, display_name, color_role)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Moi'
    ),
    case when v_role in ('toi', 'elle') then v_role::public.color_role
         else 'toi'::public.color_role end
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;
