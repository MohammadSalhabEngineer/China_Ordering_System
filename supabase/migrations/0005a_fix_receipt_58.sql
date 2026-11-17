-- 0005a  Fix receipt #58: Bassel sold 2 pcs each of 10-1, 10-2, 10-3, 10-4 but recorded them
-- as 10-10, 10-11, 10-12, 10-13 (which never arrived). The money was received.
--
-- What changes (nothing is deleted):
--   * the 4 lines on receipt #58 point to the items really sold: 10-10 -> 10-1, 10-11 -> 10-2,
--     10-12 -> 10-3, 10-13 -> 10-4. Quantities, prices charged, receipt total and payment stay as they are.
--   * each line's cost is set to the real item's cost, so profit is right
--   * stock: 10-10..10-13 get their 2 pcs back, 10-1..10-4 go down by 2, both logged in the history
-- Run this FIRST, then 0005_not_received_tea_cutlery.sql. Safe to run twice.

do $$
declare
  v_sale public.sales%rowtype;
  v_line public.sale_lines%rowtype;
  v_wrong public.items%rowtype;
  v_right public.items%rowtype;
  pair record;
  v_done int := 0;
begin
  select * into v_sale from public.sales where sale_no = 58;
  if not found then raise exception 'receipt #58 not found, nothing changed'; end if;
  if v_sale.voided then raise exception 'receipt #58 is cancelled, nothing changed'; end if;

  perform set_config('app.allow_stock', '1', true);

  for pair in select * from (values ('Bassel 10-10', 'Bassel 10-1'), ('Bassel 10-11', 'Bassel 10-2'),
                                    ('Bassel 10-12', 'Bassel 10-3'), ('Bassel 10-13', 'Bassel 10-4')) v(wrong_ref, right_ref) loop
    select * into v_wrong from public.items where sheet_ref = pair.wrong_ref;
    select * into v_right from public.items where sheet_ref = pair.right_ref;
    if v_wrong.id is null or v_right.id is null then
      raise exception 'item % or % not found, nothing changed', pair.wrong_ref, pair.right_ref;
    end if;

    select * into v_line from public.sale_lines where sale_id = v_sale.id and item_id = v_wrong.id;
    if not found then
      -- already moved on an earlier run?
      if exists (select 1 from public.stock_movements where ref_sale_id = v_sale.id and item_id = v_right.id
                   and note like 'receipt #58: line moved from %') then
        continue;
      end if;
      raise exception 'receipt #58 has no line for %, nothing changed', pair.wrong_ref;
    end if;
    if v_right.stock_qty < v_line.qty then
      raise exception 'not enough stock of % (% left, need %), nothing changed', pair.right_ref, v_right.stock_qty, v_line.qty;
    end if;

    update public.sale_lines
       set item_id = v_right.id,
           unit_cost_usd = coalesce(v_right.landed_cost_usd, v_right.cost_usd)
     where id = v_line.id;

    update public.items set stock_qty = stock_qty + v_line.qty where id = v_wrong.id;
    insert into public.stock_movements (item_id, delta, reason, ref_sale_id, note)
    values (v_wrong.id, v_line.qty, 'void', v_sale.id,
            format('receipt #58: line moved to %s (recorded under the wrong item)', pair.right_ref));

    update public.items set stock_qty = stock_qty - v_line.qty where id = v_right.id;
    insert into public.stock_movements (item_id, delta, reason, ref_sale_id, note)
    values (v_right.id, -v_line.qty, 'sale', v_sale.id,
            format('receipt #58: line moved from %s (recorded under the wrong item)', pair.wrong_ref));
    v_done := v_done + 1;
  end loop;

  raise notice 'receipt #58: % line(s) moved; total stays %', v_done, v_sale.total_usd;
end $$;
