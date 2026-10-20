-- Smoke test for the schema's RPCs and RLS. Run after 00_local_stubs.sql + the migration.
\set ON_ERROR_STOP on
\set QUIET on

-- first user becomes owner (bootstrap); further users need an invite
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'hasan@family.local', '{"display_name":"Hasan"}');
\set ON_ERROR_STOP off
\echo '--- uninvited signup must fail'
insert into auth.users (id, email) values ('33333333-3333-3333-3333-333333333333', 'stranger@family.local');
\set ON_ERROR_STOP on
insert into public.invites (login_slug, display_name, display_name_ar, role, created_by)
  values ('sara', 'Sara', 'سارة', 'seller', '11111111-1111-1111-1111-111111111111');
insert into auth.users (id, email) values ('22222222-2222-2222-2222-222222222222', 'Sara@family.local');
\echo '--- invite consumed, login names visible anonymously'
select count(*) as invites_left from public.invites;
set role anon;
select login_slug, display_name, role from public.list_login_names();
reset role;

-- items (as service role, like the import script)
select set_config('request.jwt.claim.role', 'service_role', false);
insert into public.items (id, sheet_ref, item_no, description_en, cost_usd, default_price_usd) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Bassel 2-1', 'SC1004', 'Pumpkin bowl 10"', 1.34, 2.12),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Bassel 2-2', 'SC1005', 'Pumpkin bowl 12"', 1.86, 2.95);
select public.set_initial_stock('aaaaaaaa-0000-0000-0000-000000000001', 80);
select public.set_initial_stock('aaaaaaaa-0000-0000-0000-000000000002', 40);

-- act as the seller
set role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
select set_config('request.jwt.claim.role', 'authenticated', false);

select public.register_device('dddddddd-0000-0000-0000-000000000001', 'Sara iPhone', 'Mozilla/5.0 (iPhone)', 'iPhone · Safari');

-- a sale of 2 lines, partially paid
select public.create_sale(
  'dddddddd-0000-0000-0000-000000000001', 'Abu Ali', 'Tripoli', null, 5.00, null,
  '[{"item_id":"aaaaaaaa-0000-0000-0000-000000000001","qty":5,"unit_price_usd":2.50},
    {"item_id":"aaaaaaaa-0000-0000-0000-000000000002","qty":2,"unit_price_usd":3.00}]'::jsonb
) as sale_id \gset

\set QUIET off
\echo '--- after sale: stock should be 75 and 38; total 18.50; paid 5; partial'
select sheet_ref, stock_qty from public.items order by sheet_ref;
select sale_no, total_usd, paid_usd, payment_status, customer_name, location from public.sales;
select item_id, delta, reason from public.stock_movements where reason <> 'initial' order by id;

\echo '--- overselling must fail'
\set ON_ERROR_STOP off
select public.create_sale('dddddddd-0000-0000-0000-000000000001', null, null, null, 0, null,
  '[{"item_id":"aaaaaaaa-0000-0000-0000-000000000002","qty":999,"unit_price_usd":3}]'::jsonb);
\echo '--- seller may not touch stock directly or change cost'
update public.items set stock_qty = 0 where sheet_ref = 'Bassel 2-1';
update public.items set cost_usd = 0 where sheet_ref = 'Bassel 2-1';
\echo '--- seller may not insert sales directly'
insert into public.sales (seller_id) values ('22222222-2222-2222-2222-222222222222');
\set ON_ERROR_STOP on

\echo '--- seller records the rest of the payment -> paid'
select public.record_payment(:'sale_id', 13.50, 'dddddddd-0000-0000-0000-000000000001', null);
select total_usd, paid_usd, payment_status from public.sales;
select * from public.v_receivables;
select display_name, sales_count, units_sold, revenue_usd, profit_usd from public.v_seller_stats order by display_name;

\echo '--- seller voids own sale (within 24h) -> stock restored'
select public.void_sale(:'sale_id', 'customer returned everything', 'dddddddd-0000-0000-0000-000000000001');
select sheet_ref, stock_qty from public.items order by sheet_ref;
select voided, void_reason from public.sales;
select sheet_ref, sold_qty, revenue_usd, profit_usd from public.v_item_stats order by sheet_ref;

\echo '--- owner adjusts stock; seller cannot'
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.adjust_stock('aaaaaaaa-0000-0000-0000-000000000001', -3, 'damaged', 'broken in transit', null);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', false);
\set ON_ERROR_STOP off
select public.adjust_stock('aaaaaaaa-0000-0000-0000-000000000001', -3, 'damaged', 'nope', null);
\set ON_ERROR_STOP on
select sheet_ref, stock_qty from public.items order by sheet_ref;
select display_name, role from public.profiles order by display_name;

\echo '--- delete_user: refuses active / with history, deletes a clean deactivated user'
set role postgres;
insert into public.invites (login_slug, display_name, role) values ('tmp', 'Temp', 'seller');
insert into auth.users (id, email) values ('44444444-4444-4444-4444-444444444444', 'tmp@family.local');
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
\set ON_ERROR_STOP off
select public.delete_user('44444444-4444-4444-4444-444444444444');   -- still active -> DEACTIVATE_FIRST
update public.profiles set active = false where id in ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222');
select public.delete_user('22222222-2222-2222-2222-222222222222');   -- Sara has sales -> HAS_HISTORY
\set ON_ERROR_STOP on
select public.delete_user('44444444-4444-4444-4444-444444444444');
select count(*) as profiles_left from public.profiles;
set role postgres;
select count(*) as auth_users_left from auth.users;
reset role;

\echo '--- 0003: landed cost sums to exactly 70000; phone + settings'
set role postgres;
\set ON_ERROR_STOP on
insert into public.items (sheet_ref, cost_usd, default_price_usd, initial_qty) values ('Bassel 9-9', 3.333, 9, 7);
\i supabase/migrations/0003_receipts_and_landed_cost.sql
select round(sum(initial_qty * landed_cost_usd), 4) as landed_total_should_be_70000 from public.items where active;
set role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
select public.set_my_phone(' +961 3 000 000 ');
select phone from public.profiles where id = '11111111-1111-1111-1111-111111111111';
update public.app_settings set value = 'Salhab Home' where key = 'shop_name';
select value as shop_name from public.app_settings;
reset role;
