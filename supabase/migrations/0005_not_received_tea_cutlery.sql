-- 0005  Four more items never arrived: 10-10, 10-11, 10-12, 10-13 (tea forks / spoons A-105, A-106).
-- Same method as 0004 (run 0004 first). Nothing is deleted:
--   * every item row is copied first to items_backup_0005 (owner-readable only)
--   * the four items are flagged not received, stock to 0 with a logged movement
--   * their cost leaves the container total:
--       received goods landed cost = 70,000.00 - 3,581.84 (sheet value of all 22 rows) = 66,418.16
--   * past sales, receipts and payments are not touched
--   * if any of the four has a recorded sale, it stops, changes nothing and lists those receipts
--   * safe to run twice
-- Paste into the Supabase SQL editor and Run.

create table if not exists public.items_backup_0005 as select now() as backed_up_at, * from public.items;
alter table public.items_backup_0005 enable row level security;
drop policy if exists items_backup_0005_owner on public.items_backup_0005;
create policy items_backup_0005_owner on public.items_backup_0005 for select to authenticated using (public.is_owner());
revoke all on public.items_backup_0005 from anon;
revoke insert, update, delete on public.items_backup_0005 from authenticated;

do $$
declare
  v_container numeric := 70000;
  v_target numeric;
  v_current numeric;
  v_f numeric;
  v_resid numeric;
  v_id uuid;
  v_sold text;
  v_absent text;
  r record;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'items' and column_name = 'missing_qty') then
    raise exception 'run 0004_not_received.sql first, nothing changed';
  end if;

  create temporary table not_received_0005 (sheet_ref text primary key, qty int, landed_total numeric) on commit drop;
  insert into not_received_0005 values
      ('Bassel 10-10', 100, 247.85),
      ('Bassel 10-11', 100, 247.85),
      ('Bassel 10-12', 100, 306.86),
      ('Bassel 10-13', 100, 306.86);

  select string_agg(n.sheet_ref, ', ') into v_absent
    from not_received_0005 n left join public.items i on i.sheet_ref = n.sheet_ref where i.id is null;
  if v_absent is not null then raise exception 'NOT FOUND, nothing changed: %', v_absent; end if;

  -- any sale of these items? list each receipt so it can be checked
  select string_agg(format('%s: receipt #%s, %s pcs, sold by %s on %s', i.sheet_ref, s.sale_no, l.qty,
                           coalesce(p.display_name, '?'), to_char(s.sold_at, 'DD Mon YYYY')), ' | '
                    order by i.sheet_ref, s.sale_no)
    into v_sold
    from public.sale_lines l
    join public.sales s on s.id = l.sale_id
    join public.items i on i.id = l.item_id
    left join public.profiles p on p.id = s.seller_id
   where not s.voided and i.sheet_ref in (select sheet_ref from not_received_0005);
  if v_sold is not null then raise exception 'SOLD ALREADY, nothing changed: %', v_sold; end if;

  perform set_config('app.allow_stock', '1', true);

  for r in select i.*, n.landed_total from public.items i join not_received_0005 n using (sheet_ref) loop
    if r.stock_qty <> 0 then
      insert into public.stock_movements (item_id, delta, reason, note)
      values (r.id, -r.stock_qty, 'not_received', 'never arrived in the container (17 Nov 2026)');
    end if;
    update public.items
       set missing_qty = initial_qty,
           stock_qty = 0,
           landed_cost_usd = round(r.landed_total / nullif(initial_qty, 0), 4)
     where id = r.id;
  end loop;

  -- received goods carry the container cost minus every not-received row (all 22, at sheet value)
  select v_container - sum(missing_qty * landed_cost_usd) into v_target from public.items where active and missing_qty > 0;
  select sum((initial_qty - missing_qty) * landed_cost_usd) into v_current
    from public.items where active and missing_qty < initial_qty;
  if v_current is null or v_current = 0 then raise exception 'no received items found'; end if;
  v_f := v_target / v_current;
  update public.items set landed_cost_usd = round(landed_cost_usd * v_f, 4)
   where active and missing_qty < initial_qty;
  select id into v_id from public.items where active and missing_qty = 0 and initial_qty > 0
   order by initial_qty asc, cost_usd desc limit 1;
  select v_target - sum((initial_qty - missing_qty) * landed_cost_usd) into v_resid
    from public.items where active and missing_qty < initial_qty;
  if v_id is not null and v_resid <> 0 then
    update public.items set landed_cost_usd = round(landed_cost_usd + v_resid / initial_qty, 4) where id = v_id;
  end if;
  raise notice 'received goods landed total now %, not received %', round(v_target, 2), round(v_container - v_target, 2);
end $$;

-- Undo (restores costs and stock exactly as before 0005, keeps the history):
-- do $$ begin
--   perform set_config('app.allow_stock', '1', true);
--   insert into public.stock_movements (item_id, delta, reason, note)
--     select i.id, b.stock_qty - i.stock_qty, 'not_received', 'undo 0005'
--       from public.items i join public.items_backup_0005 b on b.id = i.id where b.stock_qty <> i.stock_qty;
--   update public.items i set landed_cost_usd = b.landed_cost_usd, stock_qty = b.stock_qty, missing_qty = b.missing_qty
--     from public.items_backup_0005 b where b.id = i.id;
-- end $$;
