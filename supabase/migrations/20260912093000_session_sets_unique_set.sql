-- CM-78 : écriture incrémentale des séries.
--
-- Chaque série validée part en base immédiatement, avec un id généré côté
-- client, et la file de retry peut rejouer la même écriture plusieurs fois.
-- L'idempotence est déjà assurée par `upsert ... on conflict (id)` ; cet index
-- est la ceinture de sécurité côté base : deux lignes ne peuvent pas décrire la
-- même série de la même séance, quel que soit le chemin d'écriture.
--
-- NE PAS appliquer depuis le code ni depuis la CI : Antoine (ou Claude PM)
-- l'applique en prod via Supabase avant le merge. Le code fonctionne sans.
--
-- `concurrently` est volontairement absent : la table est minuscule et la
-- migration doit rester exécutable telle quelle dans l'éditeur SQL Supabase,
-- qui enveloppe les requêtes dans une transaction.

create unique index if not exists session_sets_session_exercise_set_key
  on public.session_sets (session_id, exercise_id, set_index);
