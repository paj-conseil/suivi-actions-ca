-- Une réunion mensuelle comporte deux sections : Conseil scolaire (valeur interne 'bureau') et Conseil d'administration ('ca').
-- Chaque section (notes, documents, actions) n'est visible que des personnes ayant le droit correspondant.
-- Migration non destructive : les données existantes sont conservées et rattachées à leur section.

-- 1. Sections de réunion (notes propres à chaque conseil)
create table public.reunion_sections (
  id uuid primary key default gen_random_uuid(),
  reunion_id uuid not null references public.reunions(id) on delete cascade,
  instance public.instance_type not null,
  notes text,
  updated_at timestamptz not null default now(),
  unique (reunion_id, instance)
);

insert into public.reunion_sections (reunion_id, instance, notes)
select id, instance, nullif(notes, '') from public.reunions where instance is not null
on conflict do nothing;

alter table public.reunion_sections enable row level security;
create policy reunion_sections_select on public.reunion_sections for select to authenticated
  using ((select public.can_see(instance)));
create policy reunion_sections_insert on public.reunion_sections for insert to authenticated
  with check ((select public.is_admin()));
create policy reunion_sections_update on public.reunion_sections for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy reunion_sections_delete on public.reunion_sections for delete to authenticated
  using ((select public.is_admin()));

-- 2. La réunion devient commune aux deux conseils : l'ancienne colonne instance devient facultative
alter table public.reunions alter column instance drop not null;

-- Visible dès qu'on a accès à l'un des deux conseils
alter policy reunions_select on public.reunions
  using ((select public.can_see('bureau')) or (select public.can_see('ca')));

-- 3. Chaque document appartient à une section
alter table public.documents add column instance public.instance_type;
update public.documents d set instance = r.instance from public.reunions r where r.id = d.reunion_id and d.instance is null;
update public.documents set instance = 'ca' where instance is null;
alter table public.documents alter column instance set not null;
create index documents_instance_idx on public.documents (reunion_id, instance);

alter policy documents_select on public.documents
  using ((select public.can_see(instance)));

-- 4. Accès aux fichiers : déterminé par la section du document correspondant
alter policy cr_select on storage.objects
  using (bucket_id = 'comptes-rendus' and exists (
    select 1 from public.documents d where d.storage_path = name and public.can_see(d.instance)));
