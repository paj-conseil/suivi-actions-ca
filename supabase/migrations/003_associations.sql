-- Associations gestionnaires (Primaire, Collège) et suivi des documents administratifs
-- Droit d'accès spécifique « Associations » : consulter et mettre à jour les documents.
-- Les administrateurs ont aussi accès.

alter table public.profiles add column is_associations boolean not null default false;

create or replace function public.can_associations() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select actif and (is_admin or is_associations) from public.profiles where id = auth.uid()), false);
$$;
revoke execute on function public.can_associations() from public, anon;
grant execute on function public.can_associations() to authenticated;

create table public.associations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('primaire', 'college')),
  nom text not null,
  notes text,
  ordre integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.associations (code, nom, ordre) values
  ('primaire', 'Association du Primaire', 1),
  ('college', 'Association du Collège', 2);

create table public.admin_documents (
  id uuid primary key default gen_random_uuid(),
  association_id uuid not null references public.associations(id) on delete cascade,
  categorie text not null default 'Autre',
  titre text not null,
  date_signature date,
  date_validite date,
  sans_echeance boolean not null default false,
  rappel_jours integer not null default 60 check (rappel_jours between 0 and 730),
  responsable_id uuid references public.profiles(id) on delete set null,
  notes text,
  archive boolean not null default false,
  remplace_id uuid references public.admin_documents(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index admin_documents_assoc_idx on public.admin_documents (association_id, archive, date_validite);
create index admin_documents_remplace_idx on public.admin_documents (remplace_id);
create index admin_documents_responsable_idx on public.admin_documents (responsable_id);
create index admin_documents_created_by_idx on public.admin_documents (created_by);

create trigger admin_documents_touch before update on public.admin_documents
  for each row execute function public.touch_updated_at();

create table public.admin_document_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.admin_documents(id) on delete cascade,
  nom_fichier text not null,
  storage_path text not null unique,
  taille integer,
  mime_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index admin_document_files_doc_idx on public.admin_document_files (document_id);
create index admin_document_files_uploader_idx on public.admin_document_files (uploaded_by);

alter table public.associations enable row level security;
alter table public.admin_documents enable row level security;
alter table public.admin_document_files enable row level security;

-- Accès : administrateurs et titulaires du droit « Associations » ; le nom des associations n'est modifiable que par un administrateur
create policy associations_select on public.associations for select to authenticated
  using ((select public.can_associations()));
create policy associations_admin_update on public.associations for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create policy admin_documents_select on public.admin_documents for select to authenticated
  using ((select public.can_associations()));
create policy admin_documents_insert on public.admin_documents for insert to authenticated
  with check ((select public.can_associations()));
create policy admin_documents_update on public.admin_documents for update to authenticated
  using ((select public.can_associations())) with check ((select public.can_associations()));
create policy admin_documents_delete on public.admin_documents for delete to authenticated
  using ((select public.can_associations()));

create policy admin_document_files_select on public.admin_document_files for select to authenticated
  using ((select public.can_associations()));
create policy admin_document_files_insert on public.admin_document_files for insert to authenticated
  with check ((select public.can_associations()));
create policy admin_document_files_delete on public.admin_document_files for delete to authenticated
  using ((select public.can_associations()));

-- Renouvellement : crée la nouvelle version et archive l'ancienne en une seule opération
create or replace function public.renouveler_document(
  p_ancien uuid, p_titre text, p_categorie text, p_date_signature date, p_date_validite date,
  p_sans_echeance boolean, p_rappel_jours integer, p_responsable uuid, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.admin_documents;
  v_new uuid;
begin
  if not public.can_associations() then raise exception 'Accès réservé'; end if;
  select * into v_old from public.admin_documents where id = p_ancien;
  if not found then raise exception 'Document introuvable'; end if;
  insert into public.admin_documents (association_id, categorie, titre, date_signature, date_validite,
    sans_echeance, rappel_jours, responsable_id, notes, remplace_id, created_by)
  values (v_old.association_id, coalesce(nullif(trim(p_categorie), ''), v_old.categorie),
    coalesce(nullif(trim(p_titre), ''), v_old.titre), p_date_signature, p_date_validite,
    coalesce(p_sans_echeance, false), coalesce(p_rappel_jours, v_old.rappel_jours),
    p_responsable, nullif(trim(p_notes), ''), v_old.id, auth.uid())
  returning id into v_new;
  update public.admin_documents set archive = true where id = v_old.id;
  return v_new;
end $$;
revoke execute on function public.renouveler_document(uuid, text, text, date, date, boolean, integer, uuid, text) from public, anon;
grant execute on function public.renouveler_document(uuid, text, text, date, date, boolean, integer, uuid, text) to authenticated;

-- Stockage privé des pièces : chemin <document_id>/<fichier>
insert into storage.buckets (id, name, public, file_size_limit)
values ('documents-associations', 'documents-associations', false, 26214400)
on conflict (id) do nothing;

create policy da_select on storage.objects for select to authenticated
  using (bucket_id = 'documents-associations' and (select public.can_associations()));
create policy da_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documents-associations' and (select public.can_associations()));
create policy da_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documents-associations' and (select public.can_associations()));
