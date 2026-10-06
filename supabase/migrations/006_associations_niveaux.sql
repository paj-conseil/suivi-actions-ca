-- Trois niveaux d'accès à la section Associations : Lecture, Modification, Suppression.
-- is_associations = Lecture ; assoc_modification et assoc_suppression s'ajoutent.
-- Modification ou Suppression donnent aussi la lecture. Les admins ont tous les droits.

alter table public.profiles add column if not exists assoc_modification boolean not null default false;
alter table public.profiles add column if not exists assoc_suppression boolean not null default false;

-- Les titulaires actuels du droit (qui pouvaient tout faire) gardent les trois niveaux
update public.profiles set assoc_modification = true, assoc_suppression = true where is_associations;

create or replace function public.can_associations() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select actif and (is_admin or is_associations or assoc_modification or assoc_suppression)
    from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_assoc_modifier() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select actif and (is_admin or assoc_modification) from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_assoc_supprimer() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select actif and (is_admin or assoc_suppression) from public.profiles where id = auth.uid()), false);
$$;

revoke execute on function public.can_assoc_modifier() from public, anon;
revoke execute on function public.can_assoc_supprimer() from public, anon;
grant execute on function public.can_assoc_modifier() to authenticated;
grant execute on function public.can_assoc_supprimer() to authenticated;

alter policy admin_documents_insert on public.admin_documents with check ((select public.can_assoc_modifier()));
alter policy admin_documents_update on public.admin_documents
  using ((select public.can_assoc_modifier())) with check ((select public.can_assoc_modifier()));
alter policy admin_documents_delete on public.admin_documents using ((select public.can_assoc_supprimer()));

alter policy admin_document_files_insert on public.admin_document_files with check ((select public.can_assoc_modifier()));
alter policy admin_document_files_delete on public.admin_document_files using ((select public.can_assoc_supprimer()));

alter policy da_insert on storage.objects
  with check (bucket_id = 'documents-associations' and (select public.can_assoc_modifier()));
alter policy da_delete on storage.objects
  using (bucket_id = 'documents-associations' and (select public.can_assoc_supprimer()));

create or replace function public.renouveler_document(
  p_ancien uuid, p_titre text, p_categorie text, p_date_signature date, p_date_validite date,
  p_sans_echeance boolean, p_rappel_jours integer, p_responsable uuid, p_notes text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_old public.admin_documents;
  v_new uuid;
begin
  if not public.can_assoc_modifier() then raise exception 'Droit de modification requis'; end if;
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
