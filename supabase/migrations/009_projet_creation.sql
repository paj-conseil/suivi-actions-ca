-- Droit de création de projets.
-- Les admins et les personnes ayant le droit « Création de projets » peuvent créer un projet.
-- Le créateur d'un projet le gère ensuite (informations, membres, suppression), comme un admin.

alter table public.profiles add column if not exists projet_creation boolean not null default false;

create or replace function public.can_projets() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select actif and (is_admin or is_projets or projet_creation) from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_creer_projet() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select actif and (is_admin or projet_creation) from public.profiles where id = auth.uid()), false);
$$;

-- Gestionnaire d'un projet : admin, ou créateur du projet ayant toujours accès aux projets
create or replace function public.is_projet_gestionnaire(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (public.can_projets() and exists (
    select 1 from public.projets where id = p and created_by = auth.uid()));
$$;

-- Le créateur voit toujours son projet
create or replace function public.is_projet_membre(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (public.can_projets() and (
    exists (select 1 from public.projet_membres m where m.projet_id = p and m.profile_id = auth.uid())
    or exists (select 1 from public.projets where id = p and created_by = auth.uid())));
$$;

revoke execute on function public.can_creer_projet() from public, anon;
revoke execute on function public.is_projet_gestionnaire(uuid) from public, anon;
grant execute on function public.can_creer_projet() to authenticated;
grant execute on function public.is_projet_gestionnaire(uuid) to authenticated;

alter policy projets_select on public.projets
  using (((select auth.uid()) = created_by and (select public.can_projets())) or (select public.is_projet_membre(id)));
alter policy projets_insert on public.projets
  with check ((select public.can_creer_projet()) and created_by = (select auth.uid()));
alter policy projets_update on public.projets
  using ((select public.is_projet_gestionnaire(id))) with check ((select public.is_projet_gestionnaire(id)));
alter policy projets_delete on public.projets using ((select public.is_projet_gestionnaire(id)));

alter policy projet_membres_insert on public.projet_membres with check ((select public.is_projet_gestionnaire(projet_id)));
alter policy projet_membres_delete on public.projet_membres using ((select public.is_projet_gestionnaire(projet_id)));
