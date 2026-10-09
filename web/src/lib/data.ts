import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import type { Customer, Item, LoginName, SaleWithLines, StockMovement } from "../types";

/** Tiny async-state hook: runs `fn`, exposes data/error/loading and a reload(). */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const reload = useCallback(async (silent = false) => {
    const my = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const d = await fnRef.current();
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), deps);
  return { data, error, loading, reload };
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function fetchLoginNames(): Promise<LoginName[]> {
  return unwrap(await supabase.rpc("list_login_names"));
}

export async function fetchItems(): Promise<Item[]> {
  return unwrap(await supabase.from("items").select("*").eq("active", true).order("page_no").order("sheet_ref"));
}

export async function fetchItem(id: string): Promise<Item> {
  return unwrap(await supabase.from("items").select("*").eq("id", id).single());
}

export async function fetchMovements(itemId: string): Promise<StockMovement[]> {
  return unwrap(
    await supabase
      .from("stock_movements")
      .select("*, profiles(display_name, display_name_ar), devices(nickname, device_label)")
      .eq("item_id", itemId)
      .order("created_at", { ascending: false })
      .limit(200),
  );
}

export const SALE_SELECT =
  "*, sale_lines(*, items(sheet_ref, item_no, description_en, description_ar, photo_path)), profiles:seller_id(display_name, display_name_ar), devices:device_id(nickname, device_label)";

export async function fetchSales(opts: { sellerId?: string; since?: Date; status?: string; limit?: number }): Promise<SaleWithLines[]> {
  let q = supabase.from("sales").select(SALE_SELECT).order("sold_at", { ascending: false }).limit(opts.limit ?? 300);
  if (opts.sellerId) q = q.eq("seller_id", opts.sellerId);
  if (opts.since) q = q.gte("sold_at", opts.since.toISOString());
  if (opts.status) q = q.eq("payment_status", opts.status).eq("voided", false);
  return unwrap(await q);
}

export async function fetchSale(id: string): Promise<SaleWithLines> {
  return unwrap(await supabase.from("sales").select(SALE_SELECT).eq("id", id).single());
}

export async function fetchCustomers(): Promise<Customer[]> {
  return unwrap(await supabase.from("customers").select("id, name, phone, location").order("name"));
}

/** Sort items by their sheet reference ("Bassel 2-10" after "Bassel 2-9"). */
export function refSortKey(ref: string): [number, number, string] {
  const m = /(\d+)-(\d+)(.*)$/.exec(ref);
  return m ? [Number(m[1]), Number(m[2]), m[3]] : [9999, 0, ref];
}
export function compareRef(a: string, b: string): number {
  const [a1, a2, a3] = refSortKey(a);
  const [b1, b2, b3] = refSortKey(b);
  return a1 - b1 || a2 - b2 || a3.localeCompare(b3);
}

/** Display name of an item in the current language, falling back sensibly. */
export function itemName(it: Pick<Item, "description_en" | "description_ar" | "item_no" | "sheet_ref">, locale: string): string {
  const primary = locale === "ar" ? it.description_ar : it.description_en;
  return primary || it.description_en || it.description_ar || it.item_no || it.sheet_ref;
}

/** Short ref shown as a chip: "2-1" instead of "Bassel 2-1". */
export function shortRef(ref: string): string {
  return ref.replace(/^Bassel\s*/i, "");
}

export function personName(p: { display_name: string; display_name_ar: string | null } | null | undefined, locale: string): string {
  if (!p) return "?";
  return (locale === "ar" && p.display_name_ar) || p.display_name;
}
