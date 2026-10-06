-- Suivi actions CA : schéma initial
-- Niveaux d'accès : administrateur (tout voir, tout éditer), bureau, conseil d'administration (ca)

create type public.instance_type as enum ('bureau', 'ca');
create type public.action_statut as enum ('a_faire', 'en_cours', 'bloquee', 'terminee', 'abandonnee');

-- Profils utilisateurs (1 pour 1 avec auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  prenom text not null,
  nom text not null,
  email text not null unique,
  is_admin boolean not null default false,
  is_bureau boolean not null default false,
  is_ca boolean not null default false,
  must_change_password boolean not null default true,
  actif boolean not null default true,
  created_at timestamptz not null default now()
);

-- Réunions (bureau ou CA)
create table public.reunions (
  id uuid primary key default gen_random_uuid(),
  instance public.instance_type not null,
  date_reunion date not null,
  titre text not null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reunions_instance_date_idx on public.reunions (instance, date_reunion desc);

-- Comptes rendus et pièces jointes
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  reunion_id uuid not null references public.reunions(id) on delete cascade,
  nom_fichier text not null,
  storage_path text not null unique,
  taille integer,
  mime_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index documents_reunion_idx on public.documents (reunion_id);

-- Actions
create table public.actions (
  id uuid primary key default gen_random_uuid(),
  instance public.instance_type not null,
  reunion_id uuid references public.reunions(id) on delete set null,
  titre text not null,
  description text,
  perimetre text,
  responsable_id uuid references public.profiles(id) on delete set null,
  echeance date,
  statut public.action_statut not null default 'a_faire',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz
);
create index actions_instance_idx on public.actions (instance, statut, echeance);
create index actions_responsable_idx on public.actions (responsable_id);
create index actions_reunion_idx on public.actions (reunion_id);

-- Historique d'avancement des actions
create table public.avancements (
  id uuid primary key default gen_random_uuid(),
  action_id uuid not null references public.actions(id) on delete cascade,
  auteur_id uuid references public.profiles(id) on delete set null,
  texte text not null,
  ancien_statut public.action_statut,
  nouveau_statut public.action_statut,
  created_at timestamptz not null default now()
);
create index avancements_action_idx on public.avancements (action_id, created_at desc);

-- ---------- Fonctions d'aide aux droits ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin and actif from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_active() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select actif from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_see(i public.instance_type) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select actif and (is_admin
      or (i = 'bureau' and is_bureau)
      or (i = 'ca' and is_ca))
    from public.profiles where id = auth.uid()
  ), false);
$$;

create or replace function public.can_see_reunion(r uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select public.can_see(instance) from public.reunions where id = r), false);
$$;

-- ---------- Horodatage ----------
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if tg_table_name = 'actions' then
    if new.statut in ('terminee', 'abandonnee') and old.statut not in ('terminee', 'abandonnee') then
      new.closed_at := now();
    elsif new.statut not in ('terminee', 'abandonnee') then
      new.closed_at := null;
    end if;
  end if;
  return new;
end $$;

create trigger reunions_touch before update on public.reunions
  for each row execute function public.touch_updated_at();
create trigger actions_touch before update on public.actions
  for each row execute function public.touch_updated_at();

-- ---------- RLS ----------
alter table public.profiles enable row level security;
alter table public.reunions enable row level security;
alter table public.documents enable row level security;
alter table public.actions enable row level security;
alter table public.avancements enable row level security;

-- Profils : tout utilisateur connecté et actif voit l'annuaire (pour les responsables) ; seul l'admin modifie
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_active()));
create policy profiles_admin_write on public.profiles for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Réunions
create policy reunions_select on public.reunions for select to authenticated
  using ((select public.can_see(instance)));
create policy reunions_admin_write on public.reunions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Documents
create policy documents_select on public.documents for select to authenticated
  using ((select public.can_see_reunion(reunion_id)));
create policy documents_admin_write on public.documents for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Actions
create policy actions_select on public.actions for select to authenticated
  using ((select public.can_see(instance)));
create policy actions_admin_write on public.actions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- Avancements : visibles comme l'action ; écrits via la fonction update_action_avancement ou par l'admin
create policy avancements_select on public.avancements for select to authenticated
  using (exists (select 1 from public.actions a where a.id = action_id and (select public.can_see(a.instance))));
create policy avancements_admin_write on public.avancements for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ---------- RPC ----------
-- Le responsable d'une action (ou un admin) met à jour son statut et ajoute un point d'avancement
create or replace function public.update_action_avancement(
  p_action_id uuid, p_statut public.action_statut default null, p_texte text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_action public.actions;
begin
  select * into v_action from public.actions where id = p_action_id;
  if not found then raise exception 'Action introuvable'; end if;
  if not (public.is_admin() or (v_action.responsable_id = auth.uid() and public.can_see(v_action.instance))) then
    raise exception 'Seul le responsable de l''action ou un administrateur peut la mettre à jour';
  end if;
  if p_statut is null and coalesce(trim(p_texte), '') = '' then
    raise exception 'Rien à enregistrer';
  end if;
  if p_statut is not null and p_statut <> v_action.statut then
    update public.actions set statut = p_statut where id = p_action_id;
  end if;
  insert into public.avancements (action_id, auteur_id, texte, ancien_statut, nouveau_statut)
  values (p_action_id, auth.uid(),
          coalesce(nullif(trim(p_texte), ''), 'Changement de statut'),
          case when p_statut is not null and p_statut <> v_action.statut then v_action.statut end,
          case when p_statut is not null and p_statut <> v_action.statut then p_statut end);
end $$;

-- Lève l'obligation de changer le mot de passe (appelée juste après le changement)
create or replace function public.mark_password_changed() returns void
language sql security definer set search_path = '' as $$
  update public.profiles set must_change_password = false where id = auth.uid();
$$;

revoke execute on function public.update_action_avancement(uuid, public.action_statut, text) from public, anon;
revoke execute on function public.mark_password_changed() from public, anon;
grant execute on function public.update_action_avancement(uuid, public.action_statut, text) to authenticated;
grant execute on function public.mark_password_changed() to authenticated;
revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_active() from public, anon;
revoke execute on function public.can_see(public.instance_type) from public, anon;
revoke execute on function public.can_see_reunion(uuid) from public, anon;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active() to authenticated;
grant execute on function public.can_see(public.instance_type) to authenticated;
grant execute on function public.can_see_reunion(uuid) to authenticated;

-- ---------- Stockage des comptes rendus ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('comptes-rendus', 'comptes-rendus', false, 26214400)
on conflict (id) do nothing;

-- Chemin : <reunion_id>/<fichier>
create policy cr_select on storage.objects for select to authenticated
  using (bucket_id = 'comptes-rendus'
         and (select public.can_see_reunion(((storage.foldername(name))[1])::uuid)));
create policy cr_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'comptes-rendus' and (select public.is_admin()));
create policy cr_update on storage.objects for update to authenticated
  using (bucket_id = 'comptes-rendus' and (select public.is_admin()));
create policy cr_delete on storage.objects for delete to authenticated
  using (bucket_id = 'comptes-rendus' and (select public.is_admin()));
