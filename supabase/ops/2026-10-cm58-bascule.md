# CM-58 : bascule vers la connexion par compte (opérations manuelles)

Checklist à dérouler **à la main**, dans l'ordre, avec l'accord d'Antoine.
Rien ici n'est lancé par le code ni par la CI. Chaque étape a sa vérification
et son retour arrière. On ne passe à l'étape suivante que si la vérification
est bonne.

- Projet Supabase : `drmmgwchoowggpsppilo` (prod, la seule base).
- Profils : `11111111-1111-1111-1111-111111111111` (Antoine) et
  `22222222-2222-2222-2222-222222222222` (Léa). Ils deviennent les ids des
  comptes Auth : aucune donnée n'est déplacée.
- Les emails ne sont volontairement pas écrits ici (repo public).
- Les requêtes SQL se lancent dans Supabase, SQL Editor.

## Étape 0 : prérequis

1. La PR CM-58 est mergée et déployée, **sans** variable `AUTH_MODE` sur
   Vercel (donc mode `cookie`). L'app se comporte exactement comme avant.
2. Vérifier sur Vercel (Settings, Environment Variables, Production) que
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` est bien définie (le client d'auth s'en sert).
3. Aucune séance en cours au moment des changements :

   ```sql
   select count(*) from public.sessions where duration_seconds is null;  -- attendu : 0
   ```

4. Garder une copie de la fonction actuelle (pour le retour arrière de l'étape 1) :

   ```sql
   select pg_get_functiondef('public.handle_new_user()'::regprocedure);
   ```

## Étape 1 : appliquer la migration M1 (trigger)

Fichier : `supabase/migrations/20261006120000_cm58_auth_trigger.sql`.
Copier son contenu dans le SQL Editor et l'exécuter (ou `apply_migration`
avec le nom `cm58_auth_trigger`).

Vérification :

```sql
select pg_get_functiondef('public.handle_new_user()'::regprocedure) like '%on conflict (id) do nothing%' as ok;  -- true
select tgname, tgenabled from pg_trigger where tgname = 'on_auth_user_created';                              -- 1 ligne, 'O'
select count(*) from public.profiles;                                                                          -- 2 (inchangé)
```

Retour arrière : réexécuter la définition copiée à l'étape 0.4 (elle commence
par `CREATE OR REPLACE FUNCTION public.handle_new_user()`). Le trigger
lui-même n'a pas besoin d'être touché.

## Étape 2 : supprimer le compte Auth orphelin

Le compte `f5ad642c-d4f1-475f-8142-e72c92eab7e9` (email d'Antoine, créé le
13/06, relié à aucun profil) bloque la création du vrai compte d'Antoine
avec le même email.

Avant, s'assurer qu'il n'est relié à rien :

```sql
select id, email, created_at from auth.users;                                                    -- 1 ligne : f5ad642c-…
select count(*) from public.profiles where id = 'f5ad642c-d4f1-475f-8142-e72c92eab7e9';         -- 0
select count(*) from public.sessions where profile_id = 'f5ad642c-d4f1-475f-8142-e72c92eab7e9'; -- 0
```

Suppression : Supabase, Authentication, Users, ligne `f5ad642c-…`, Delete user.

Vérification :

```sql
select count(*) from auth.users;       -- 0
select count(*) from auth.identities;   -- 0
```

Retour arrière : aucun utile (compte vide, sans donnée). Si jamais il fallait
un compte pour cet email, il sera recréé à l'étape 4 sur le bon id.

## Étape 3 : fermer l'inscription publique (recommandé)

La clé anon est publique : tant que l'inscription est ouverte, n'importe qui
peut créer un compte Auth via l'API, et le trigger lui crée un profil.
L'app n'a pas de page d'inscription (CM-86 plus tard).

Supabase, Authentication, Sign In / Providers : désactiver
« Allow new users to sign up ». L'API admin (utilisée par le bloc
« Créer mon mot de passe ») continue de fonctionner.

Vérification : le réglage apparaît désactivé.
Retour arrière : le réactiver.

## Étape 4 : passer en `AUTH_MODE=hybrid`

1. Vercel, Settings, Environment Variables, Production :
   - `AUTH_MODE` = `hybrid`
   - facultatif : `AUTH_PREFILL_EMAILS` =
     `11111111-1111-1111-1111-111111111111=<email d'Antoine>,22222222-2222-2222-2222-222222222222=<email de Léa>`
     (pré-remplit le champ email du bloc ; sinon le champ est vide).
2. Redéployer la production (Deployments, dernier déploiement, Redeploy) :
   une variable d'env ne s'applique qu'au déploiement suivant.

Vérification (navigateur) :

- L'accueil montre toujours « Qui s'entraîne ? » et, en dessous, le lien
  « J'ai un mot de passe : me connecter ».
- `/login` affiche le formulaire de connexion.
- Écran Profil : le bloc « Créer mon mot de passe » apparaît.

Retour arrière : supprimer `AUTH_MODE` (ou le mettre à `cookie`), redéployer.
Les sessions déjà ouvertes sont simplement ignorées en mode `cookie`.

À savoir : en `hybrid`, le cookie de profil reste falsifiable (comme
aujourd'hui), et le bloc crée un compte pour le profil du cookie. Garder cette
fenêtre **courte** (le temps que chacun crée son mot de passe) et faire
l'étape 6 avant `required`.

## Étape 5 : chacun crée son mot de passe

Sur son téléphone (PWA et/ou coque iOS), chacun :

1. choisit son profil sur l'accueil (comme d'habitude) ;
2. ouvre Profil, bloc « Créer mon mot de passe » : vérifie l'email, saisit
   un mot de passe (8 caractères minimum) et sa confirmation ;
3. valide : la session s'ouvre directement, l'écran Profil montre
   « Se déconnecter » et plus « Changer de profil ».

Sur un deuxième appareil (ou après « Se déconnecter ») : accueil, lien
« J'ai un mot de passe : me connecter », email et mot de passe.

Retour arrière pour un compte (mauvais email, mot de passe oublié) : aucune
FK ne relie encore `profiles` à `auth.users` (elle arrive en M2), donc
supprimer le compte Auth ne touche à aucune donnée. Supabase, Authentication,
Users, supprimer la ligne de cet id, puis refaire l'étape 5 pour ce profil.

## Étape 6 : vérifier les comptes avant `required`

```sql
-- Exactement les 2 ids attendus, avec les bons emails, et rien d'autre.
select u.id, u.email, u.created_at, u.last_sign_in_at, p.display_name
from auth.users u
left join public.profiles p on p.id = u.id
order by u.created_at;
-- attendu : 2 lignes, ids 11111111-… et 22222222-…, display_name non null,
-- emails = ceux d'Antoine et de Léa (à vérifier à l'œil).

-- Chaque profil a son compte.
select p.id, p.display_name, (u.id is not null) as a_un_compte
from public.profiles p
left join auth.users u on u.id = p.id;
-- attendu : 2 lignes, a_un_compte = true partout.

-- Aucun profil fantôme créé par le trigger.
select count(*) from public.profiles;   -- 2

-- Données intactes (à comparer avec l'avant, aux nouvelles séances près).
select 'sessions' t, count(*) from public.sessions union all
select 'session_sets', count(*) from public.session_sets;
```

Si une ligne ne correspond pas (compte en trop, email inconnu) : supprimer ce
compte Auth (voir étape 5, retour arrière) et ne pas passer à l'étape 7.

## Étape 7 : passer en `AUTH_MODE=required`

1. Vercel : `AUTH_MODE` = `required`, puis redéployer la production.
2. `AUTH_PREFILL_EMAILS` peut être supprimée (plus utilisée).

Vérification :

- Navigation privée : `/` et `/dashboard` mènent à `/login`.
- Connexion d'Antoine puis de Léa : chacun retrouve ses séances.
- Profil : « Se déconnecter » ramène à `/login`.
- Le sélecteur « Qui s'entraîne ? » n'est plus accessible.

Retour arrière : `AUTH_MODE` = `hybrid` (ou supprimer la variable pour revenir
en `cookie`), redéployer. Aucune donnée ne dépend du mode.

## Après la bascule (hors de cette checklist)

- M2 du cadrage (FK `profiles.id` vers `auth.users`) quand les deux comptes
  sont validés.
- CM-59 : client de données à la clé anon + session, RLS réelle.
- Pas encore d'email (pas de SMTP) : aucune réinitialisation de mot de passe
  par email. En cas d'oubli : retour arrière de l'étape 5 en repassant
  temporairement en `hybrid`.
