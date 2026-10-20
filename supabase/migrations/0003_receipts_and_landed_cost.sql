-- 1) Landed cost redistributed so the whole container costs exactly $70,000:
--    landed = goods cost x (70000 / sum(initial_qty x goods cost)), 4 decimals.
-- 2) Receipt support: shop name setting + each person's phone.
-- Paste into the Supabase SQL editor once. Safe to re-run.

-- the reporting views reference unit_cost_usd, so they are recreated around the type change
drop view if exists public.v_item_stats;
drop view if exists public.v_seller_stats;
alter table public.items alter column landed_cost_usd type numeric(10, 4);
alter table public.sale_lines alter column unit_cost_usd type numeric(10, 4);

create or replace view public.v_item_stats with (security_invoker = true) as
select i.id as item_id, i.sheet_ref,
       coalesce(sum(l.qty) filter (where not s.voided), 0)::int as sold_qty,
       coalesce(sum(l.line_total) filter (where not s.voided), 0)::numeric(12,2) as revenue_usd,
       coalesce(sum(l.qty * (l.unit_price_usd - l.unit_cost_usd)) filter (where not s.voided), 0)::numeric(12,2) as profit_usd
from public.items i
left join public.sale_lines l on l.item_id = i.id
left join public.sales s on s.id = l.sale_id
group by i.id, i.sheet_ref;

create or replace view public.v_seller_stats with (security_invoker = true) as
select p.id as seller_id, p.display_name,
       count(distinct s.id) filter (where not s.voided)::int as sales_count,
       coalesce(sum(l.qty) filter (where not s.voided), 0)::int as units_sold,
       coalesce(sum(l.line_total) filter (where not s.voided), 0)::numeric(12,2) as revenue_usd,
       coalesce(sum(l.qty * (l.unit_price_usd - l.unit_cost_usd)) filter (where not s.voided), 0)::numeric(12,2) as profit_usd
from public.profiles p
left join public.sales s on s.seller_id = p.id
left join public.sale_lines l on l.sale_id = s.id
group by p.id, p.display_name;

do $$
declare
  v_total numeric := 70000;
  v_k numeric;
  v_resid numeric;
  v_id uuid;
begin
  select v_total / nullif(sum(initial_qty * cost_usd), 0) into v_k from public.items where active;
  if v_k is null then return; end if;
  update public.items set landed_cost_usd = round(cost_usd * v_k, 4) where active;
  -- put the leftover rounding cents on the item with the smallest quantity so the sum is exact
  select id into v_id from public.items where active and initial_qty > 0 order by initial_qty asc, cost_usd desc limit 1;
  select v_total - sum(initial_qty * landed_cost_usd) into v_resid from public.items where active;
  if v_id is not null and v_resid <> 0 then
    update public.items set landed_cost_usd = round(landed_cost_usd + v_resid / initial_qty, 4) where id = v_id;
  end if;
end $$;

-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_read on public.app_settings for select to authenticated using (public.is_active_user());
drop policy if exists app_settings_owner on public.app_settings;
create policy app_settings_owner on public.app_settings for all to authenticated using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.app_settings to authenticated;
insert into public.app_settings (key, value) values ('shop_name', '') on conflict (key) do nothing;

alter table public.profiles add column if not exists phone text;

create or replace function public.set_my_phone(p_phone text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.profiles set phone = nullif(trim(p_phone), '') where id = auth.uid();
end $$;
grant execute on function public.set_my_phone(text) to authenticated;
