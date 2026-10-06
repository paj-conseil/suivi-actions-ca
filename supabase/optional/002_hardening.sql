-- Durcissement : fonctions d'aide hors de l'API, politiques d'écriture séparées, index manquants

create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;
alter function public.is_active() set schema private;
alter function public.can_see(public.instance_type) set schema private;
alter function public.can_see_reunion(uuid) set schema private;

create or replace function private.can_see_reunion(r uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select private.can_see(instance) from public.reunions where id = r), false);
$$;

create or replace function public.update_action_avancement(
  p_action_id uuid, p_statut public.action_statut default null, p_texte text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_action public.actions;
begin
  select * into v_action from public.actions where id = p_action_id;
  if not found then raise exception 'Action introuvable'; end if;
  if not (private.is_admin() or (v_action.responsable_id = auth.uid() and private.can_see(v_action.instance))) then
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

-- Remplacer les politiques "for all" par insert / update / delete (une seule politique SELECT par table)
do $$
declare t text;
begin
  foreach t in array array['profiles','reunions','documents','actions','avancements'] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_write', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))', t || '_admin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))', t || '_admin_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))', t || '_admin_delete', t);
  end loop;
end $$;

-- L'admin voit aussi les profils (déjà couvert par profiles_select via is_active)

create index if not exists actions_created_by_idx on public.actions (created_by);
create index if not exists avancements_auteur_idx on public.avancements (auteur_id);
create index if not exists documents_uploaded_by_idx on public.documents (uploaded_by);
create index if not exists reunions_created_by_idx on public.reunions (created_by);
