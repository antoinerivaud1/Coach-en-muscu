-- CM-69: suppression de la colonne weekdays de program_days
-- Vestige de la logique de planning date, abandonnee en juillet 2026
-- au profit d'une bibliotheque de seances nommees (CM-65, CM-66).
-- Colonne vide sur 100% des lignes en production au 10/08/2026.

alter table public.program_days
  drop column if exists weekdays;
