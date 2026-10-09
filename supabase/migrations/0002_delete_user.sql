-- Owner can permanently delete a deactivated person who has no recorded history.
-- Removes the auth account too, so the login name can be used again.
create or replace function public.delete_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_prof public.profiles%rowtype;
begin
  if not public.is_owner() then raise exception 'owner only'; end if;
  if p_user_id = auth.uid() then raise exception 'cannot delete yourself'; end if;
  select * into v_prof from public.profiles where id = p_user_id;
  if not found then raise exception 'user not found'; end if;
  if v_prof.active then raise exception 'DEACTIVATE_FIRST'; end if;
  if exists (select 1 from public.sales where seller_id = p_user_id or voided_by = p_user_id)
     or exists (select 1 from public.payments where recorded_by = p_user_id)
     or exists (select 1 from public.stock_movements where user_id = p_user_id) then
    raise exception 'HAS_HISTORY';
  end if;
  delete from public.devices where user_id = p_user_id;
  update public.customers set created_by = null where created_by = p_user_id;
  update public.invites set created_by = null where created_by = p_user_id;
  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;
end $$;

grant execute on function public.delete_user(uuid) to authenticated;
