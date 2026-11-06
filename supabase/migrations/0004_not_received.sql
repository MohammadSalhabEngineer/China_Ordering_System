-- 0004  Items that never arrived (18 rows of the order sheet).
--
-- Nothing is deleted. The items stay in the database with all their history; they are
-- flagged as not received, their stock goes to 0 through a logged "not_received" movement,
-- and their cost is taken out of the container total as if they had not been bought:
--   received goods landed cost = 70,000.00 - 2,472.42 (sheet value of the 18 rows) = 67,527.58
--
-- Safety:
--   * A full copy of every item row is saved first in items_backup_0004 (owner-readable only).
--   * Stops before changing anything if any of the 18 items has a recorded sale.
--   * Past sales are not touched: receipts, totals and recorded profit stay as they are.
--   * Safe to run twice.
-- Paste into the Supabase SQL editor and Run.

-- 1) backup (kept on re-runs: only the first, pre-change copy is stored)
create table if not exists public.items_backup_0004 as select now() as backed_up_at, * from public.items;
alter table public.items_backup_0004 enable row level security;
drop policy if exists items_backup_0004_owner on public.items_backup_0004;
create policy items_backup_0004_owner on public.items_backup_0004 for select to authenticated using (public.is_owner());
revoke all on public.items_backup_0004 from anon;
revoke insert, update, delete on public.items_backup_0004 from authenticated;

-- 2) schema: new movement reason + received tracking
alter table public.stock_movements drop constraint if exists stock_movements_reason_check;
alter table public.stock_movements add constraint stock_movements_reason_check
  check (reason in ('initial', 'sale', 'void', 'adjustment', 'return', 'damaged', 'not_received'));

alter table public.items add column if not exists missing_qty int not null default 0;
alter table public.items drop constraint if exists items_missing_qty_check;
alter table public.items add constraint items_missing_qty_check check (missing_qty >= 0 and missing_qty <= initial_qty);

-- 3) the 18 items: sheet ref, ordered pieces, sheet landed total ("TOTAL USD + MARKUP")
do $$
declare
  v_container numeric := 70000;
  v_missing_total numeric;
  v_target numeric;
  v_current numeric;
  v_f numeric;
  v_resid numeric;
  v_id uuid;
  v_sold text;
  v_absent text;
  r record;
begin
  create temporary table not_received_0004 (sheet_ref text primary key, qty int, landed_total numeric) on commit drop;
  insert into not_received_0004 values
      ('Bassel 2-21', 60, 92.06),
      ('Bassel 2-29', 60, 59.48),
      ('Bassel 2-32', 60, 53.82),
      ('Bassel 2-33', 60, 48.15),
      ('Bassel 2-34', 90, 84.98),
      ('Bassel 3-6', 16, 188.84),
      ('Bassel 3-17', 288, 135.96),
      ('Bassel 3-19', 288, 169.95),
      ('Bassel 3-21', 192, 99.71),
      ('Bassel 3-22', 288, 135.96),
      ('Bassel 4-1', 60, 269.09),
      ('Bassel 9-14', 16, 283.25),
      ('Bassel 11-1', 12, 121.80),
      ('Bassel 11-2', 12, 135.96),
      ('Bassel 15-3', 60, 77.89),
      ('Bassel 15-5', 60, 96.31),
      ('Bassel 17-10', 48, 192.61),
      ('Bassel 38-3', 240, 226.60);

  -- every listed ref must exist
  select string_agg(n.sheet_ref, ', ') into v_absent
    from not_received_0004 n left join public.items i on i.sheet_ref = n.sheet_ref where i.id is null;
  if v_absent is not null then raise exception 'NOT FOUND, nothing changed: %', v_absent; end if;

  -- stop if any of them was sold (then it did arrive, at least partly)
  select string_agg(distinct i.sheet_ref, ', ') into v_sold
    from public.sale_lines l join public.sales s on s.id = l.sale_id join public.items i on i.id = l.item_id
   where not s.voided and i.sheet_ref in (select sheet_ref from not_received_0004);
  if v_sold is not null then raise exception 'SOLD ALREADY, nothing changed: %', v_sold; end if;

  perform set_config('app.allow_stock', '1', true);

  -- flag as not received, stock to 0, cost = the sheet's own landed value for the row
  for r in select i.*, n.landed_total from public.items i join not_received_0004 n using (sheet_ref) loop
    if r.stock_qty <> 0 then
      insert into public.stock_movements (item_id, delta, reason, note)
      values (r.id, -r.stock_qty, 'not_received', 'never arrived in the container (6 Nov 2026)');
    end if;
    update public.items
       set missing_qty = initial_qty,
           stock_qty = 0,
           landed_cost_usd = round(r.landed_total / nullif(initial_qty, 0), 4)
     where id = r.id;
  end loop;

  select sum(landed_total) into v_missing_total from not_received_0004;
  -- 4-decimal unit costs can leave a cent of rounding; put it on the smallest-quantity row so the
  -- not-received total is exactly the sheet's 2,472.42
  select i.id into v_id from public.items i join not_received_0004 n using (sheet_ref)
   order by i.initial_qty asc, i.sheet_ref limit 1;
  select v_missing_total - sum(i.missing_qty * i.landed_cost_usd) into v_resid
    from public.items i join not_received_0004 n using (sheet_ref);
  if v_resid <> 0 then
    update public.items set landed_cost_usd = round(landed_cost_usd + v_resid / initial_qty, 4) where id = v_id;
  end if;

  -- received goods carry the container cost minus the not-received rows: 70,000 - 2,472.42.
  -- Scale every received item's current landed cost by the same factor (keeps any manual edits proportional).
  v_target := v_container - v_missing_total;
  select sum((initial_qty - missing_qty) * landed_cost_usd) into v_current
    from public.items where active and missing_qty < initial_qty;
  if v_current is null or v_current = 0 then raise exception 'no received items found'; end if;
  v_f := v_target / v_current;
  update public.items set landed_cost_usd = round(landed_cost_usd * v_f, 4)
   where active and missing_qty < initial_qty;
  -- rounding cents onto the received item with the smallest quantity, so the sum is exact
  select id into v_id from public.items where active and missing_qty = 0 and initial_qty > 0
   order by initial_qty asc, cost_usd desc limit 1;
  select v_target - sum((initial_qty - missing_qty) * landed_cost_usd) into v_resid
    from public.items where active and missing_qty < initial_qty;
  if v_id is not null and v_resid <> 0 then
    update public.items set landed_cost_usd = round(landed_cost_usd + v_resid / initial_qty, 4) where id = v_id;
  end if;
  raise notice 'received goods landed total now %, factor %', v_target, round(v_f, 6);
end $$;

-- 4) owner function for future cases (partial shortages, a replacement arriving later)
create or replace function public.set_missing_qty(p_item_id uuid, p_missing int, p_note text, p_device_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_item public.items%rowtype; v_delta int;
begin
  if not public.is_owner() then raise exception 'owner only'; end if;
  select * into v_item from public.items where id = p_item_id for update;
  if not found then raise exception 'item not found'; end if;
  if p_missing < 0 or p_missing > v_item.initial_qty then raise exception 'bad quantity'; end if;
  v_delta := v_item.missing_qty - p_missing;            -- stock change: fewer missing = more stock
  if v_item.stock_qty + v_delta < 0 then raise exception 'INSUFFICIENT_STOCK:%:%', v_item.sheet_ref, v_item.stock_qty; end if;
  if v_delta = 0 then return; end if;
  perform set_config('app.allow_stock', '1', true);
  update public.items set missing_qty = p_missing, stock_qty = stock_qty + v_delta where id = p_item_id;
  insert into public.stock_movements (item_id, delta, reason, note, user_id, device_id)
  values (p_item_id, v_delta, 'not_received', nullif(trim(p_note), ''), auth.uid(), p_device_id);
end $$;
grant execute on function public.set_missing_qty(uuid, int, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- To undo everything above (restores costs and stock exactly as they were, keeps the history):
-- do $$ begin
--   perform set_config('app.allow_stock', '1', true);
--   insert into public.stock_movements (item_id, delta, reason, note)
--     select i.id, b.stock_qty - i.stock_qty, 'not_received', 'undo 0004'
--       from public.items i join public.items_backup_0004 b on b.id = i.id where b.stock_qty <> i.stock_qty;
--   update public.items i set landed_cost_usd = b.landed_cost_usd, stock_qty = b.stock_qty, missing_qty = 0
--     from public.items_backup_0004 b where b.id = i.id;
-- end $$;
