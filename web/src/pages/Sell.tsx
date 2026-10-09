import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShoppingCart, Trash2, Check } from "lucide-react";
import { fetchItems, fetchCustomers, useAsync, itemName, shortRef } from "../lib/data";
import { supabase, explainError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { money } from "../lib/format";
import { Header } from "../components/Header";
import { ItemGrid, SearchBar, CategoryChips, useItemFilter } from "../components/ItemGrid";
import { ErrorBox, Field, Loading, Photo, Sheet, Spinner, Stepper, Toast } from "../components/ui";
import type { CartLine, Item } from "../types";

type PayMode = "full" | "none" | "partial";

export default function SellPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { deviceId } = useAuth();
  const items = useAsync(fetchItems, []);
  const customers = useAsync(fetchCustomers, []);
  const { q, setQ, cat, setCat, filtered, categories } = useItemFilter(items.data, "all");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [editing, setEditing] = useState<Item | null>(null);
  const [checkout, setCheckout] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const qtyOf = useCallback((it: Item) => cart.find((l) => l.item.id === it.id)?.qty ?? 0, [cart]);
  const total = useMemo(() => cart.reduce((s, l) => s + l.qty * l.unitPrice, 0), [cart]);
  const count = cart.reduce((s, l) => s + l.qty, 0);

  function upsert(item: Item, qty: number, unitPrice: number) {
    setCart((c) => {
      const rest = c.filter((l) => l.item.id !== item.id);
      return qty > 0 ? [...rest, { item, qty, unitPrice }] : rest;
    });
  }

  function onSaved(saleNo: number, saleId: string) {
    setCart([]);
    setCheckout(false);
    setToast(t("sell.savedDetail", { no: saleNo, total: money(total) }));
    void items.reload(true);
    void customers.reload(true);
    nav(`/history/${saleId}`);
  }

  return (
    <>
      <Header title={t("sell.title")}>
        <SearchBar value={q} onChange={setQ} placeholder={t("sell.searchPlaceholder")} />
        <div className="mt-2">
          <CategoryChips value={cat} onChange={setCat} categories={categories} />
        </div>
      </Header>

      {items.loading && !items.data ? (
        <Loading />
      ) : items.error ? (
        <ErrorBox error={items.error} onRetry={() => items.reload()} />
      ) : (
        <ItemGrid items={filtered} onTap={(it) => it.stock_qty > 0 && setEditing(it)} showPrice selectedQty={qtyOf} />
      )}

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-[4.5rem] z-40 px-3 pointer-events-none">
          <button className="btn-primary w-full max-w-lg mx-auto pointer-events-auto shadow-lg flex justify-between" onClick={() => setCheckout(true)}>
            <span className="flex items-center gap-2">
              <ShoppingCart size={20} /> {t("sell.cart")} · {count} {t("common.pcs")}
            </span>
            <span>{money(total)}</span>
          </button>
        </div>
      )}

      <LineEditor
        item={editing}
        initial={editing ? cart.find((l) => l.item.id === editing.id) : undefined}
        onClose={() => setEditing(null)}
        onSave={(qty, price) => {
          if (editing) upsert(editing, qty, price);
          setEditing(null);
        }}
      />

      <Checkout
        open={checkout}
        cart={cart}
        total={total}
        customers={customers.data ?? []}
        deviceId={deviceId}
        onClose={() => setCheckout(false)}
        onEditLine={(it) => {
          setCheckout(false);
          setEditing(it);
        }}
        onRemove={(it) => upsert(it, 0, 0)}
        onSaved={onSaved}
      />

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function LineEditor({
  item,
  initial,
  onClose,
  onSave,
}: {
  item: Item | null;
  initial?: CartLine;
  onClose: () => void;
  onSave: (qty: number, price: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [key, setKey] = useState<string | null>(null);
  // reset local state whenever a different item opens
  if (item && key !== item.id) {
    setKey(item.id);
    setQty(initial?.qty ?? 1);
    setPrice(String(initial?.unitPrice ?? item.default_price_usd));
  }
  if (!item) return null;
  const p = parseFloat(price) || 0;
  return (
    <Sheet open onClose={onClose} title={t("sell.addToSale")}>
      <div className="flex gap-3 mb-4">
        <Photo path={item.photo_path} alt="" className="h-24 w-24 rounded-xl shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-mono text-muted">{shortRef(item.sheet_ref)}{item.item_no ? ` · ${item.item_no}` : ""}</p>
          <p className="font-semibold leading-snug">{itemName(item, i18n.language)}</p>
          <p className="text-sm text-muted mt-1">{t("sell.inStock", { count: item.stock_qty })}</p>
        </div>
      </div>
      <div className="flex items-center justify-between mb-4">
        <span className="label mb-0">{t("common.qty")}</span>
        <Stepper value={qty} min={1} max={item.stock_qty} onChange={setQty} />
      </div>
      {qty >= item.stock_qty && <p className="text-xs text-warn -mt-2 mb-3 text-end">{t("sell.maxStock", { count: item.stock_qty })}</p>}
      <Field label={t("sell.unitPrice")} hint={t("sell.suggested", { price: money(item.default_price_usd) })}>
        <div className="relative">
          <span className="absolute start-4 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input className="input ps-8 text-lg" type="number" inputMode="decimal" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </Field>
      <div className="flex items-center justify-between text-lg font-bold mb-4">
        <span>{t("common.total")}</span>
        <span>{money(qty * p)}</span>
      </div>
      <div className="flex gap-2">
        {initial && (
          <button className="btn-secondary text-bad" onClick={() => onSave(0, 0)} aria-label={t("sell.remove")}>
            <Trash2 size={20} />
          </button>
        )}
        <button className="btn-primary grow" onClick={() => onSave(qty, p)} disabled={p < 0}>
          <Check size={20} /> {initial ? t("common.save") : t("sell.addToSale")}
        </button>
      </div>
    </Sheet>
  );
}

function Checkout({
  open,
  cart,
  total,
  customers,
  deviceId,
  onClose,
  onEditLine,
  onRemove,
  onSaved,
}: {
  open: boolean;
  cart: CartLine[];
  total: number;
  customers: { name: string; location: string | null }[];
  deviceId: string;
  onClose: () => void;
  onEditLine: (it: Item) => void;
  onRemove: (it: Item) => void;
  onSaved: (saleNo: number, saleId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [customer, setCustomer] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("full");
  const [paid, setPaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paidAmount = payMode === "full" ? total : payMode === "none" ? 0 : Math.min(total, parseFloat(paid) || 0);
  const suggestions = useMemo(() => {
    const n = customer.trim().toLowerCase();
    if (!n) return [];
    return customers.filter((c) => c.name.toLowerCase().includes(n) && c.name.toLowerCase() !== n).slice(0, 5);
  }, [customer, customers]);

  async function save() {
    setBusy(true);
    setError(null);
    const { data, error } = await supabase.rpc("create_sale", {
      p_device_id: deviceId,
      p_customer_name: customer.trim() || null,
      p_location: location.trim() || null,
      p_note: note.trim() || null,
      p_paid_usd: paidAmount,
      p_sold_at: null,
      p_lines: cart.map((l) => ({ item_id: l.item.id, qty: l.qty, unit_price_usd: l.unitPrice })),
    });
    setBusy(false);
    if (error) {
      const ex = explainError(error);
      setError(t(ex.key, ex.args));
      return;
    }
    const saleId = data as string;
    const { data: s } = await supabase.from("sales").select("sale_no").eq("id", saleId).single();
    setCustomer("");
    setLocation("");
    setNote("");
    setPayMode("full");
    setPaid("");
    onSaved(s?.sale_no ?? 0, saleId);
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("sell.cart")} tall>
      <ul className="divide-y divide-line card mb-4">
        {cart.map((l) => (
          <li key={l.item.id} className="flex items-center gap-3 p-3">
            <Photo path={l.item.photo_path} alt="" className="h-14 w-14 rounded-lg shrink-0" />
            <button className="min-w-0 grow text-start" onClick={() => onEditLine(l.item)}>
              <p className="text-sm font-medium truncate">{itemName(l.item, i18n.language)}</p>
              <p className="text-xs text-muted">
                {l.qty} × {money(l.unitPrice)}
              </p>
            </button>
            <span className="font-semibold">{money(l.qty * l.unitPrice)}</span>
            <button className="p-2 text-muted" onClick={() => onRemove(l.item)} aria-label={t("sell.remove")}>
              <Trash2 size={18} />
            </button>
          </li>
        ))}
      </ul>

      <Field label={`${t("sell.customer")} (${t("common.optional")})`}>
        <input className="input" value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder={t("sell.customerPlaceholder")} autoComplete="off" />
        {suggestions.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {suggestions.map((c) => (
              <button
                key={c.name}
                type="button"
                className="rounded-full bg-brand-soft text-brand-dark px-3 py-1 text-sm"
                onClick={() => {
                  setCustomer(c.name);
                  if (c.location && !location) setLocation(c.location);
                }}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </Field>
      <Field label={`${t("sell.location")} (${t("common.optional")})`}>
        <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder={t("sell.locationPlaceholder")} />
      </Field>

      <span className="label">{t("sell.paid")}</span>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {(["full", "partial", "none"] as PayMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`rounded-xl border px-2 py-2.5 text-sm font-semibold ${payMode === m ? "bg-brand text-white border-brand" : "bg-white border-line"}`}
            onClick={() => setPayMode(m)}
          >
            {t(m === "full" ? "sell.paidFull" : m === "none" ? "sell.paidNone" : "sell.paidPartial")}
          </button>
        ))}
      </div>
      {payMode === "partial" && (
        <div className="relative mb-4">
          <span className="absolute start-4 top-1/2 -translate-y-1/2 text-muted">$</span>
          <input className="input ps-8" type="number" inputMode="decimal" step="0.01" min="0" max={total} value={paid} onChange={(e) => setPaid(e.target.value)} autoFocus />
        </div>
      )}

      <Field label={`${t("sell.note")} (${t("common.optional")})`}>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>

      <div className="card p-4 mb-4 space-y-1">
        <div className="flex justify-between text-lg font-bold">
          <span>{t("common.total")}</span>
          <span>{money(total)}</span>
        </div>
        {payMode !== "full" && (
          <div className="flex justify-between text-sm text-warn">
            <span>{t("history.due", { amount: money(total - paidAmount) })}</span>
            <span>{money(paidAmount)} {t("payment.paid").toLowerCase()}</span>
          </div>
        )}
      </div>
      {error && <p className="text-bad text-sm mb-3">{error}</p>}
      <button className="btn-primary w-full text-lg py-4" onClick={save} disabled={busy || cart.length === 0}>
        {busy ? <Spinner className="text-white" /> : t("sell.saveSale")}
      </button>
    </Sheet>
  );
}
