-- Module Projets : accès restreint (droit « Projets ») puis par projet (membres).
-- Les admins voient et gèrent tous les projets. Les membres d'un projet gèrent ses thèmes, tâches et commentaires.

alter table public.profiles add column if not exists is_projets boolean not null default false;

create type public.projet_statut as enum ('preparation', 'en_cours', 'en_pause', 'termine', 'abandonne');

create table public.projets (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  objectif text,
  statut public.projet_statut not null default 'en_cours',
  date_debut date,
  date_fin date,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index projets_created_by_idx on public.projets (created_by);

create table public.projet_membres (
  projet_id uuid not null references public.projets(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (projet_id, profile_id)
);
create index projet_membres_profile_idx on public.projet_membres (profile_id);

create table public.projet_themes (
  id uuid primary key default gen_random_uuid(),
  projet_id uuid not null references public.projets(id) on delete cascade,
  nom text not null,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);
create index projet_themes_projet_idx on public.projet_themes (projet_id, ordre);

create table public.projet_taches (
  id uuid primary key default gen_random_uuid(),
  projet_id uuid not null references public.projets(id) on delete cascade,
  theme_id uuid not null references public.projet_themes(id) on delete cascade,
  parent_id uuid references public.projet_taches(id) on delete cascade,
  titre text not null,
  description text,
  responsable_id uuid references public.profiles(id) on delete set null,
  echeance date,
  statut public.action_statut not null default 'a_faire',
  ordre integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index projet_taches_projet_idx on public.projet_taches (projet_id);
create index projet_taches_theme_idx on public.projet_taches (theme_id, ordre);
create index projet_taches_parent_idx on public.projet_taches (parent_id);
create index projet_taches_resp_idx on public.projet_taches (responsable_id);
create index projet_taches_created_by_idx on public.projet_taches (created_by);

create table public.projet_commentaires (
  id uuid primary key default gen_random_uuid(),
  tache_id uuid not null references public.projet_taches(id) on delete cascade,
  auteur_id uuid references public.profiles(id) on delete set null,
  texte text not null,
  created_at timestamptz not null default now()
);
create index projet_commentaires_tache_idx on public.projet_commentaires (tache_id, created_at);
create index projet_commentaires_auteur_idx on public.projet_commentaires (auteur_id);

-- Horodatage et date de clôture (réutilise le déclencheur des actions)
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name in ('actions', 'projet_taches') then
    if new.statut in ('terminee', 'abandonnee') and old.statut not in ('terminee', 'abandonnee') then
      new.closed_at := now();
    elsif new.statut not in ('terminee', 'abandonnee') then
      new.closed_at := null;
    end if;
  end if;
  return new;
end $$;
create trigger projets_touch before update on public.projets for each row execute function public.touch_updated_at();
create trigger projet_taches_touch before update on public.projet_taches for each row execute function public.touch_updated_at();

-- Cohérence : deux niveaux seulement, sous-tâche dans le même projet et le même thème que sa tâche
create or replace function public.projet_taches_check() returns trigger
language plpgsql set search_path = '' as $$
declare p public.projet_taches;
begin
  if new.statut in ('terminee', 'abandonnee') and tg_op = 'INSERT' then new.closed_at := now(); end if;
  if (select projet_id from public.projet_themes where id = new.theme_id) <> new.projet_id then
    raise exception 'Le thème n''appartient pas à ce projet';
  end if;
  if new.parent_id is not null then
    select * into p from public.projet_taches where id = new.parent_id;
    if p.parent_id is not null then raise exception 'Une sous-tâche ne peut pas avoir de sous-tâche'; end if;
    if p.projet_id <> new.projet_id then raise exception 'Sous-tâche hors du projet'; end if;
    new.theme_id := p.theme_id;
  end if;
  return new;
end $$;
create trigger projet_taches_check before insert or update on public.projet_taches
  for each row execute function public.projet_taches_check();

-- Quand une tâche change de thème, ses sous-tâches la suivent
create or replace function public.projet_taches_follow_theme() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.parent_id is null and new.theme_id <> old.theme_id then
    update public.projet_taches set theme_id = new.theme_id where parent_id = new.id;
  end if;
  return null;
end $$;
create trigger projet_taches_follow_theme after update of theme_id on public.projet_taches
  for each row execute function public.projet_taches_follow_theme();

revoke execute on function public.projet_taches_check() from public, anon, authenticated;
revoke execute on function public.projet_taches_follow_theme() from public, anon, authenticated;

-- Fonctions de droits
create or replace function public.can_projets() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select actif and (is_admin or is_projets) from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_projet_membre(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (public.can_projets() and exists (
    select 1 from public.projet_membres m where m.projet_id = p and m.profile_id = auth.uid()));
$$;

create or replace function public.tache_projet(t uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select projet_id from public.projet_taches where id = t;
$$;

revoke execute on function public.can_projets() from public, anon;
revoke execute on function public.is_projet_membre(uuid) from public, anon;
revoke execute on function public.tache_projet(uuid) from public, anon;
grant execute on function public.can_projets() to authenticated;
grant execute on function public.is_projet_membre(uuid) to authenticated;
grant execute on function public.tache_projet(uuid) to authenticated;

alter table public.projets enable row level security;
alter table public.projet_membres enable row level security;
alter table public.projet_themes enable row level security;
alter table public.projet_taches enable row level security;
alter table public.projet_commentaires enable row level security;

-- Projets : visibles par leurs membres ; création, modification et suppression par les admins
create policy projets_select on public.projets for select to authenticated using ((select public.is_projet_membre(id)));
create policy projets_insert on public.projets for insert to authenticated with check ((select public.is_admin()));
create policy projets_update on public.projets for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy projets_delete on public.projets for delete to authenticated using ((select public.is_admin()));

-- Membres : visibles par les membres du projet ; gérés par les admins
create policy projet_membres_select on public.projet_membres for select to authenticated
  using ((select public.is_projet_membre(projet_id)));
create policy projet_membres_insert on public.projet_membres for insert to authenticated with check ((select public.is_admin()));
create policy projet_membres_delete on public.projet_membres for delete to authenticated using ((select public.is_admin()));

-- Thèmes et tâches : lus et modifiés par les membres du projet
create policy projet_themes_all on public.projet_themes for all to authenticated
  using ((select public.is_projet_membre(projet_id))) with check ((select public.is_projet_membre(projet_id)));
create policy projet_taches_all on public.projet_taches for all to authenticated
  using ((select public.is_projet_membre(projet_id))) with check ((select public.is_projet_membre(projet_id)));

-- Commentaires : lus et ajoutés par les membres ; supprimés par leur auteur ou un admin
create policy projet_commentaires_select on public.projet_commentaires for select to authenticated
  using ((select public.is_projet_membre(public.tache_projet(tache_id))));
create policy projet_commentaires_insert on public.projet_commentaires for insert to authenticated
  with check (auteur_id = (select auth.uid()) and (select public.is_projet_membre(public.tache_projet(tache_id))));
create policy projet_commentaires_delete on public.projet_commentaires for delete to authenticated
  using (auteur_id = (select auth.uid()) or (select public.is_admin()));
