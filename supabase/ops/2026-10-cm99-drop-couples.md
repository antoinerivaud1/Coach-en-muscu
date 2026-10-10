# CM-99 (CM-85 partie B) : suppression du modèle couple (opérations manuelles)

Procédure à dérouler **à la main**, dans l'ordre, par Antoine. Rien ici n'est
lancé par le code ni par la CI. On ne passe à l'étape suivante que si la
précédente est bonne.

- Projet Supabase : `coach-en-muscu` (`drmmgwchoowggpsppilo`, prod, la seule base).
- Fichier SQL unique à coller : `supabase/ops/2026-10-cm99-drop-couples.sql`
  (la migration `20261010120000_cm99_drop_couples.sql` à l'identique, dans une
  transaction, puis une vérification).

## Ce que ça change

- Supprimés : tables `couples` et `couple_members`, colonnes
  `exercises.couple_id` et `programs.couple_id` (avec leurs FK et index), les
  4 triggers de synchro couple / duo, les fonctions `create_couple`,
  `join_couple`, `sync_couple_duo_id`, `sync_couples_to_duos`,
  `sync_couple_members_to_duo_members`.
- Nouvelle contrainte `programs_owner_xor_duo` : un programme est soit perso
  (`owner_profile_id`), soit partagé (`duo_id`), jamais les deux ni aucun. Elle
  remplace `program_owner_xor`, qui portait sur `couple_id`.
- Conservés : `duo_members_max_two` (2 membres max par duo),
  `on_auth_user_created`, les 22 policies et les droits de CM-59.
- Aucune donnée perdue : tout ce que portait le modèle couple est déjà dans
  `duos` / `duo_members` / `duo_id` (même uuid, depuis CM-85 partie A). Le SQL
  refuse de s'exécuter si ce n'était pas le cas.
- Côté app : rien de visible. Le code ne lit déjà plus le modèle couple ; la
  PR ne fait que retirer les types et commentaires qui en parlaient.

## Étape a : appliquer le SQL en prod (AVANT le merge)

1. Vérifier qu'aucune séance n'est en cours (SQL Editor) :

   ```sql
   select count(*) from public.sessions where duration_seconds is null;  -- 0
   ```

   Si ce n'est pas 0, attendre la fin de la séance.
2. Copier **tout** le contenu de `supabase/ops/2026-10-cm99-drop-couples.sql`
   dans le SQL Editor, puis Run.
3. Le résultat est une seule ligne : **`ok` (dernière colonne) doit valoir
   `true`**. Les autres colonnes disent quel contrôle a échoué le cas échéant.
   - Une erreur « CM-99 : n ligne(s) avec un couple_id non recopié… » : rien
     n'a été appliqué (transaction annulée). Ne pas aller plus loin, me
     prévenir.
   - Toute autre erreur : rien n'a été appliqué non plus ; lire le message.

Le fichier est rejouable : le relancer sur une base déjà migrée ne change rien
et renvoie de nouveau `ok = true`.

## Étape b : merger la PR

1. CI de la PR verte (dont « Tests e2e (Supabase local) », qui rejoue toutes
   les migrations, les tests pgTAP et les vérifications SQL).
2. Merger : Vercel déploie la production.
3. Vérification rapide (téléphone) : accueil, Séances, démarrer puis
   abandonner une séance, Historique, Progression. Aucun changement visible
   attendu.

## Étape c : réaligner l'historique des migrations (Terminal du Mac)

Le SQL Editor n'enregistre rien dans `supabase_migrations.schema_migrations`.
L'historique de la prod porte encore les 14 versions d'avant le baseline, et
aucune des versions du repo. Cette étape ne touche **que** l'historique,
jamais le schéma ni les données.

Dans le Terminal du Mac, à la racine du repo **à jour** (`git pull` sur
`main` après le merge) :

```bash
npx supabase link --project-ref drmmgwchoowggpsppilo
# (demande le mot de passe de la base)

# 1. Versions de la prod absentes du repo : retirées de l'historique.
npx supabase migration repair --status reverted \
  20260506183839 20260506183903 20260506183923 20260506184200 20260506184232 \
  20260506184742 20260613170036 20260615212659 20260619113051 20260619113408 \
  20260621200549 20260621201636 20260906140326 20260912211215

# 2. Tous les fichiers de supabase/migrations, déjà appliqués en prod
#    (baseline = état d'avant, CM-69, CM-78, CM-58, CM-85 A x2, CM-59 A x2,
#    CM-99).
npx supabase migration repair --status applied \
  20260506000000 20260812072300 20260912093000 20261006120000 \
  20261007090000 20261007090100 20261010090000 20261010090100 \
  20261010120000

# 3. Contrôle : colonnes Local et Remote identiques sur chaque ligne
#    (9 lignes, de 20260506000000 à 20261010120000).
npx supabase migration list
```

**Ne jamais lancer `supabase db push` avant ce repair** : il tenterait de
rejouer le baseline, qui échoue volontairement sur la prod. Une fois le repair
fait, `db push` n'appliquera plus que les migrations futures.

Si l'étape 4 de `2026-10-cm85-partie-a.md` avait déjà été faite, relancer les
commandes ci-dessus est sans danger (même résultat).

## Retour arrière

- Code : sur Vercel, Deployments, re-promouvoir le déploiement d'avant le
  merge. Le code d'avant CM-99 ne lit pas le modèle couple : il fonctionne sur
  le schéma après CM-99, aucun SQL n'est nécessaire.
- Schéma : la suppression est **irréversible sans sauvegarde** (tables et
  colonnes supprimées avec leur contenu). Rien n'est perdu pour autant, ce
  contenu étant redondant avec les duos. Si une version de code plus ancienne
  devait relire `couples` / `couple_id`, le bloc commenté en bas de
  `2026-10-cm99-drop-couples.sql` recrée les structures et les remplit depuis
  les duos ; puis
  `npx supabase migration repair --status reverted 20261010120000`.
