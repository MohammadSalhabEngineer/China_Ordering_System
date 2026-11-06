-- 0004a  Fix a mislabelled sale: a piece of 9-13 (CX-1037) was sold but recorded as 9-14 (CX-1027).
-- 9-14 never arrived. Both rows are identical on the sheet (16 pcs, RMB 75, same cost and price),
-- so the two items swap their labels (sheet ref, code, names, photo). Nothing else changes:
-- no sale, receipt, payment, stock quantity or money figure is edited. The old receipt then
-- shows 9-13, which is what was really sold.
--
-- Run this FIRST, then run 0004_not_received.sql again.
-- Stops without changing anything if the situation is not exactly as expected. Safe to run twice.

do $$
declare
  a public.items%rowtype;   -- currently labelled 9-14, holds the sale -> becomes 9-13
  b public.items%rowtype;   -- currently labelled 9-13                 -> becomes 9-14 (not arrived)
  a_sales int;
  b_sales int;
begin
  select * into a from public.items where sheet_ref = 'Bassel 9-14';
  select * into b from public.items where sheet_ref = 'Bassel 9-13';
  if a.id is null or b.id is null then raise exception 'items 9-13 / 9-14 not found, nothing changed'; end if;

  if coalesce(a.item_no, '') <> 'CX-1027' or coalesce(b.item_no, '') <> 'CX-1037' then
    raise exception 'unexpected item codes (9-14: %, 9-13: %), nothing changed', a.item_no, b.item_no;
  end if;

  select count(*) into a_sales from public.sale_lines l join public.sales s on s.id = l.sale_id
   where l.item_id = a.id and not s.voided;
  select count(*) into b_sales from public.sale_lines l join public.sales s on s.id = l.sale_id
   where l.item_id = b.id and not s.voided;
  -- already swapped: the sale now sits on 9-13 and 9-14 has none
  if a_sales = 0 and b_sales > 0 then
    raise notice 'already swapped, nothing to do';
    return;
  end if;

  if a.initial_qty <> b.initial_qty or a.cost_usd <> b.cost_usd or a.default_price_usd <> b.default_price_usd
     or coalesce(a.landed_cost_usd, -1) <> coalesce(b.landed_cost_usd, -1) then
    raise exception 'the two items differ in quantity or price, nothing changed';
  end if;

  if a_sales = 0 then raise exception 'no sale found on 9-14, nothing changed'; end if;
  if b_sales > 0 then raise exception '9-13 also has % sale line(s), nothing changed: ask before swapping', b_sales; end if;

  -- swap labels (sheet_ref is unique, so park one first)
  update public.items set sheet_ref = 'Bassel 9-14 (swapping)' where id = a.id;
  update public.items set
      sheet_ref = 'Bassel 9-14', item_no = a.item_no,
      description_zh = a.description_zh, description_en = a.description_en, description_ar = a.description_ar,
      needs_review = a.needs_review,
      photo_path = 'items/Bassel_9-14.jpg'               -- original sheet photo of 9-14 (palm pattern)
   where id = b.id;
  update public.items set
      sheet_ref = 'Bassel 9-13', item_no = b.item_no,
      description_zh = b.description_zh, description_en = b.description_en, description_ar = b.description_ar,
      needs_review = b.needs_review,
      -- keep the photo someone already uploaded of the 9-13 trays; if it is still the old 9-14
      -- sheet photo, use the 9-13 sheet photo instead
      photo_path = case when a.photo_path is null or a.photo_path = 'items/Bassel_9-14.jpg'
                        then 'items/Bassel_9-13.jpg' else a.photo_path end
   where id = a.id;
  raise notice 'swapped: the item with the sale is now 9-13 (CX-1037); 9-14 (CX-1027) is ready to be marked not arrived';
end $$;
