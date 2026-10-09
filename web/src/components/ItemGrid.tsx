import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import type { Item } from "../types";
import { compareRef, itemName, shortRef } from "../lib/data";
import { Photo, StockBadge, Empty } from "./ui";
import { money } from "../lib/format";

export type StockFilter = "all" | "low" | "out";

export function useItemFilter(items: Item[] | null, filter: StockFilter) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("");
  const { i18n } = useTranslation();
  const filtered = useMemo(() => {
    if (!items) return [];
    const needle = q.trim().toLowerCase();
    return items
      .filter((it) => {
        if (filter === "out" && it.stock_qty > 0) return false;
        if (filter === "low" && (it.stock_qty <= 0 || it.stock_qty > Math.max(2, Math.ceil(it.initial_qty * 0.2)))) return false;
        if (cat && it.category !== cat) return false;
        if (!needle) return true;
        const hay = [it.sheet_ref, shortRef(it.sheet_ref), it.item_no, it.description_en, it.description_ar, it.description_zh]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return needle.split(/\s+/).every((w) => hay.includes(w));
      })
      .sort((a, b) => compareRef(a.sheet_ref, b.sheet_ref));
  }, [items, q, cat, filter, i18n.language]);
  const categories = useMemo(() => Array.from(new Set((items ?? []).map((i) => i.category).filter(Boolean))) as string[], [items]);
  return { q, setQ, cat, setCat, filtered, categories };
}

export function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search size={20} className="absolute top-1/2 -translate-y-1/2 start-3 text-muted" />
      <input
        className="input ps-10"
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoCapitalize="none"
      />
    </div>
  );
}

export function CategoryChips({ value, onChange, categories }: { value: string; onChange: (v: string) => void; categories: string[] }) {
  const { t } = useTranslation();
  if (categories.length === 0) return null;
  const chip = (key: string, label: string) => (
    <button
      key={key}
      className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium border ${value === key ? "bg-brand text-white border-brand" : "bg-white text-ink border-line"}`}
      onClick={() => onChange(key)}
    >
      {label}
    </button>
  );
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-3 px-3 [scrollbar-width:none]">
      {chip("", t("common.all"))}
      {categories.map((c) => chip(c, t(`categories.${c}`, { defaultValue: c })))}
    </div>
  );
}

export function ItemGrid({
  items,
  onTap,
  showPrice,
  selectedQty,
}: {
  items: Item[];
  onTap: (it: Item) => void;
  showPrice?: boolean;
  selectedQty?: (it: Item) => number;
}) {
  const { t, i18n } = useTranslation();
  if (items.length === 0) return <Empty>{t("stock.noItems")}</Empty>;
  return (
    <ul className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
      {items.map((it) => {
        const sel = selectedQty?.(it) ?? 0;
        return (
          <li key={it.id}>
            <button
              className={`card w-full overflow-hidden text-start active:scale-[0.98] transition relative ${sel ? "ring-2 ring-brand" : ""} ${it.stock_qty <= 0 ? "opacity-60" : ""}`}
              onClick={() => onTap(it)}
            >
              <Photo path={it.photo_path} alt={itemName(it, i18n.language)} className="w-full aspect-square" />
              {sel > 0 && (
                <span className="absolute top-2 end-2 rounded-full bg-brand text-white text-sm font-bold h-7 min-w-7 px-2 flex items-center justify-center shadow">
                  {sel}
                </span>
              )}
              <div className="p-2.5">
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className="text-[11px] font-mono text-muted truncate">{shortRef(it.sheet_ref)}{it.item_no ? ` · ${it.item_no}` : ""}</span>
                  <StockBadge stock={it.stock_qty} initial={it.initial_qty} />
                </div>
                <p className="text-sm font-medium leading-snug line-clamp-2 min-h-[2.5em]">{itemName(it, i18n.language)}</p>
                {showPrice && <p className="mt-1 text-base font-bold text-brand-dark">{money(it.default_price_usd)}</p>}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
