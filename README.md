# China container sales & stock tracker

Phone-first web app for a family selling the contents of one container order from China. Tracks stock per item (with photos from the order sheet), records sales with who sold what, to whom, where, when and from which phone, computes profit, and works in Arabic or English.

Runs for free: static site on GitHub Pages + Supabase free tier (Postgres, auth, photo storage).

```
bassel china.pdf                 the order sheet (source of truth for items, costs, photos)
2026.7 Catalog .pdf              supplier catalog, not used by the app
scripts/parse_order.py           PDF → data/items.json + data/photos/ + data/report.txt
data/translations.json           English/Arabic names + category per sheet ref
supabase/migrations/0001_init.sql  schema, row-level security, sale/void/payment functions
supabase/tests/                  local stub + smoke test (plain PostgreSQL, no Supabase needed)
web/                             Vite + React + TypeScript + Tailwind PWA
web/scripts/import.mjs           loads data/ into Supabase (one time, service role key)
.github/workflows/deploy.yml     builds web/ and publishes to GitHub Pages
docs/SETUP.md                    step-by-step setup for the owner
```

## Develop

```powershell
cd web
copy .env.example .env.local     # Supabase URL + anon key
npm install
npm run dev
```

## Test the database layer locally

Needs a local PostgreSQL (18 was used) with `initdb`/`pg_ctl` on PATH:

```powershell
psql -U postgres -c "create database tracker"
psql -U postgres -d tracker -f supabase/tests/00_local_stubs.sql -f supabase/migrations/0001_init.sql
psql -U postgres -d tracker -f supabase/tests/01_smoke.sql
```

## Design rules

- Every stock change goes through `create_sale`, `void_sale`, `adjust_stock` or `set_initial_stock` (security-definer functions). Direct updates to `items.stock_qty` are rejected by a trigger; sales rows are never deleted, only voided with a reason.
- Sellers may read everything and create sales; only owners edit items, costs, users, and may void any sale (sellers: own sales within 24 h).
- The browser talks to Supabase directly with the public anon key; row-level security is the authorization layer.
- New accounts are created client-side with `signUp`, accepted by the database only if the owner inserted an `invites` row first. The very first account becomes the owner.
