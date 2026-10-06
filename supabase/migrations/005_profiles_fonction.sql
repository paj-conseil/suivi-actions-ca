-- Fonction de la personne (Président, Directeur, Trésorier...)
alter table public.profiles add column if not exists fonction text;
