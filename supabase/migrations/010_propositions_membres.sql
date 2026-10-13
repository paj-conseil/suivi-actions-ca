-- Membres de projet : le créateur choisit parmi les comptes existants,
-- ou propose une nouvelle personne, soumise à l'approbation d'un admin.

-- 1. Ajouter un compte existant à un projet lui ouvre l'onglet Projets (et rien d'autre)
create or replace function public.projet_membres_grant() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set is_projets = true
  where id = new.profile_id and not is_projets and not is_admin;
  return new;
end $$;
revoke execute on function public.projet_membres_grant() from public, anon, authenticated;
create trigger projet_membres_grant after insert on public.projet_membres
  for each row execute function public.projet_membres_grant();

-- 2. Propositions de nouveaux membres
create type public.proposition_statut as enum ('en_attente', 'acceptee', 'refusee');

create table public.projet_propositions (
  id uuid primary key default gen_random_uuid(),
  projet_id uuid not null references public.projets(id) on delete cascade,
  prenom text not null,
  nom text not null,
  email text not null,
  fonction text,
  message text,
  statut public.proposition_statut not null default 'en_attente',
  proposed_by uuid references public.profiles(id) on delete set null,
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  motif text,
  profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index projet_propositions_statut_idx on public.projet_propositions (statut, created_at desc);
create index projet_propositions_projet_idx on public.projet_propositions (projet_id);
create index projet_propositions_proposed_idx on public.projet_propositions (proposed_by);
create index projet_propositions_decided_idx on public.projet_propositions (decided_by);
create index projet_propositions_profile_idx on public.projet_propositions (profile_id);

alter table public.projet_propositions enable row level security;

-- Lecture : admins, et gestionnaires du projet concerné
create policy projet_propositions_select on public.projet_propositions for select to authenticated
  using ((select public.is_projet_gestionnaire(projet_id)));
-- Proposition : par un gestionnaire du projet, en son nom, toujours « en attente »
create policy projet_propositions_insert on public.projet_propositions for insert to authenticated
  with check ((select public.is_projet_gestionnaire(projet_id)) and proposed_by = (select auth.uid()) and statut = 'en_attente');
-- Décision : admins uniquement
create policy projet_propositions_update on public.projet_propositions for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- Retrait d'une proposition en attente par son auteur, ou suppression par un admin
create policy projet_propositions_delete on public.projet_propositions for delete to authenticated
  using ((select public.is_admin()) or (proposed_by = (select auth.uid()) and statut = 'en_attente'));
