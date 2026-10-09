/**
 * One-time import of the parsed order sheet into Supabase.
 *
 *   1. python scripts/parse_order.py          (repo root → data/items.json + data/photos/)
 *   2. cd web && SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import.mjs
 *
 * Safe to re-run: items are matched by sheet_ref; stock is only initialised for
 * items that have no stock movements yet, so existing sales are never touched.
 */
import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const dataDir = path.join(root, "data");

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (Project Settings → API → service_role).");
  process.exit(1);
}
const sb = createClient(url, key, { auth: { persistSession: false } });

const rows = JSON.parse(await readFile(path.join(dataDir, "items.json"), "utf8"));
const tr = JSON.parse(await readFile(path.join(dataDir, "translations.json"), "utf8"));
const skipPhotos = process.argv.includes("--no-photos");

let uploaded = 0, inserted = 0, updated = 0, initialised = 0;
for (const r of rows) {
  const t = tr[r.ref] ?? {};
  let photo_path = null;
  if (r.photo) {
    photo_path = `items/${r.photo}`;
    const file = path.join(dataDir, "photos", r.photo);
    if (!skipPhotos && existsSync(file)) {
      const { error } = await sb.storage.from("item-photos").upload(photo_path, await readFile(file), {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "31536000",
      });
      if (error) throw new Error(`photo ${r.photo}: ${error.message}`);
      uploaded++;
    }
  }

  const item = {
    sheet_ref: r.ref,
    item_no: r.item_no || null,
    description_zh: [r.item_no, r.desc_zh].filter(Boolean).join(" ").trim() || null,
    description_en: t.en ?? null,
    description_ar: t.ar ?? null,
    category: t.cat ?? null,
    page_no: r.page,
    cartons: r.cartons,
    qty_per_carton: r.qty_per_carton,
    cost_usd: r.cost_usd ?? 0,                 // goods only
    landed_cost_usd: r.landed_cost_usd ?? null, // blue column, incl. shipping — profit uses this
    default_price_usd: r.sell_price_usd ?? 0,   // green column
    rmb_price: r.rmb_price,
    cbm: r.cbm,
    weight_kg: r.weight_kg,
    photo_path,
    needs_review: r.needs_review ?? null,
  };

  const { data: existing } = await sb.from("items").select("id").eq("sheet_ref", r.ref).maybeSingle();
  let id;
  if (existing) {
    const { error } = await sb.from("items").update(item).eq("id", existing.id);
    if (error) throw new Error(`${r.ref}: ${error.message}`);
    id = existing.id;
    updated++;
  } else {
    const { data, error } = await sb.from("items").insert(item).select("id").single();
    if (error) throw new Error(`${r.ref}: ${error.message}`);
    id = data.id;
    inserted++;
  }

  const { count } = await sb.from("stock_movements").select("id", { count: "exact", head: true }).eq("item_id", id);
  if (!count && r.total_qty != null) {
    const { error } = await sb.rpc("set_initial_stock", { p_item_id: id, p_qty: Math.round(r.total_qty) });
    if (error) throw new Error(`${r.ref} stock: ${error.message}`);
    initialised++;
  }
  process.stdout.write(`\r${r.ref.padEnd(22)} photos ${uploaded}  new ${inserted}  updated ${updated}  stock set ${initialised}   `);
}
console.log("\ndone");
