import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchItems, useAsync } from "../lib/data";
import { Header } from "../components/Header";
import { ItemGrid, SearchBar, CategoryChips, useItemFilter, type StockFilter } from "../components/ItemGrid";
import { ErrorBox, Loading } from "../components/ui";
import { int, money } from "../lib/format";
import { useAuth } from "../lib/auth";

export default function StockPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { isOwner } = useAuth();
  const items = useAsync(fetchItems, []);
  const [filter, setFilter] = useState<StockFilter>("all");
  const { q, setQ, cat, setCat, filtered, categories } = useItemFilter(items.data, filter);

  const all = items.data ?? [];
  const totalLeft = all.reduce((s, i) => s + i.stock_qty, 0);
  const stockValue = all.reduce((s, i) => s + i.stock_qty * Number(i.landed_cost_usd ?? i.cost_usd), 0);

  return (
    <>
      <Header title={t("stock.title")}>
        <SearchBar value={q} onChange={setQ} placeholder={t("sell.searchPlaceholder")} />
        <div className="mt-2 flex gap-2">
          {(["all", "low", "out"] as StockFilter[]).map((f) => (
            <button
              key={f}
              className={`rounded-full px-3 py-1.5 text-sm font-medium border ${filter === f ? "bg-ink text-white border-ink" : "bg-white border-line"}`}
              onClick={() => setFilter(f)}
            >
              {t(`stock.filter${f[0].toUpperCase()}${f.slice(1)}`)}
            </button>
          ))}
        </div>
        <div className="mt-2">
          <CategoryChips value={cat} onChange={setCat} categories={categories} />
        </div>
      </Header>
      {items.data && (
        <p className="px-4 pt-3 text-sm text-muted">
          {t("stock.items", { count: filtered.length })} · {int(totalLeft)} {t("common.pcs")}
          {isOwner && ` · ${t("stock.value")} ${money(stockValue)}`}
        </p>
      )}
      {items.loading && !items.data ? (
        <Loading />
      ) : items.error ? (
        <ErrorBox error={items.error} onRetry={() => items.reload()} />
      ) : (
        <ItemGrid items={filtered} onTap={(it) => nav(`/stock/${it.id}`)} />
      )}
    </>
  );
}
