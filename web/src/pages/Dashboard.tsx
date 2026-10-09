import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fetchItems, fetchSales, useAsync, personName, itemName, shortRef } from "../lib/data";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { Empty, ErrorBox, Loading, Photo } from "../components/ui";
import { dayKey, int, money, pct } from "../lib/format";
import type { SaleWithLines } from "../types";

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const { isOwner, profile } = useAuth();
  const sales = useAsync(() => fetchSales({ sellerId: isOwner ? undefined : profile?.id, limit: 5000 }), [isOwner, profile?.id]);
  const items = useAsync(fetchItems, []);
  const receivables = useAsync(async () => {
    const { data } = await supabase.from("v_receivables").select("*").order("sold_at", { ascending: false });
    return (data ?? []) as { sale_id: string; sale_no: number; customer_name: string | null; due_usd: number; seller_id: string }[];
  }, []);

  const live = useMemo(() => (sales.data ?? []).filter((s) => !s.voided), [sales.data]);
  const totals = useMemo(() => {
    let revenue = 0,
      cost = 0,
      units = 0;
    for (const s of live) {
      revenue += Number(s.total_usd);
      for (const l of s.sale_lines) {
        units += l.qty;
        cost += l.qty * Number(l.unit_cost_usd);
      }
    }
    return { revenue, profit: revenue - cost, units, count: live.length };
  }, [live]);

  const perDay = useMemo(() => {
    const days: { day: string; label: string; revenue: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400e3);
      days.push({ day: dayKey(d.toISOString()), label: String(d.getDate()), revenue: 0 });
    }
    const idx = new Map(days.map((d, i) => [d.day, i]));
    for (const s of live) {
      const i = idx.get(dayKey(s.sold_at));
      if (i !== undefined) days[i].revenue += Number(s.total_usd);
    }
    return days;
  }, [live]);

  const bySeller = useMemo(() => {
    const m = new Map<string, { name: string; revenue: number; profit: number; units: number; count: number }>();
    for (const s of live) {
      const k = s.seller_id;
      const e = m.get(k) ?? { name: personName(s.profiles, i18n.language), revenue: 0, profit: 0, units: 0, count: 0 };
      e.revenue += Number(s.total_usd);
      e.count += 1;
      for (const l of s.sale_lines) {
        e.units += l.qty;
        e.profit += l.qty * (Number(l.unit_price_usd) - Number(l.unit_cost_usd));
      }
      m.set(k, e);
    }
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
  }, [live, i18n.language]);

  const topItems = useMemo(() => {
    const m = new Map<string, { item: SaleWithLines["sale_lines"][number]["items"]; id: string; units: number; revenue: number }>();
    for (const s of live)
      for (const l of s.sale_lines) {
        const e = m.get(l.item_id) ?? { item: l.items, id: l.item_id, units: 0, revenue: 0 };
        e.units += l.qty;
        e.revenue += Number(l.line_total);
        m.set(l.item_id, e);
      }
    return Array.from(m.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8);
  }, [live]);

  const stockValue = (items.data ?? []).reduce((s, i) => s + i.stock_qty * Number(i.landed_cost_usd ?? i.cost_usd), 0);
  // sales target = everything in the container sold at its list price
  const targetUsd = (items.data ?? []).reduce((s, i) => s + i.initial_qty * Number(i.default_price_usd), 0);
  const lowItems = (items.data ?? []).filter((i) => i.stock_qty > 0 && i.stock_qty <= Math.max(2, Math.ceil(i.initial_qty * 0.2))).length;
  const outItems = (items.data ?? []).filter((i) => i.stock_qty <= 0).length;
  const owed = (receivables.data ?? []).filter((r) => isOwner || r.seller_id === profile?.id);
  const owedTotal = owed.reduce((s, r) => s + Number(r.due_usd), 0);

  if (sales.loading && !sales.data) return <Loading />;
  if (sales.error) return <ErrorBox error={sales.error} onRetry={() => sales.reload()} />;

  return (
    <>
      <Header title={t("dashboard.title")} />
      <div className="p-4 space-y-4">
        {!isOwner && <p className="text-xs text-muted">{t("dashboard.sellerOnlyHint")}</p>}
        <div className="grid grid-cols-2 gap-3">
          <Tile label={t("dashboard.revenue")} value={money(totals.revenue)} sub={isOwner && targetUsd ? t("dashboard.ofTarget", { target: pct(totals.revenue, targetUsd) }) : undefined} />
          <Tile label={t("dashboard.profit")} value={money(totals.profit)} sub={totals.revenue ? `${pct(totals.profit, totals.revenue)} ${t("dashboard.margin")}` : undefined} tone="ok" />
          <Tile label={t("dashboard.units")} value={int(totals.units)} sub={`${int(totals.count)} ${t("dashboard.sales").toLowerCase()}`} />
          <Tile label={t("dashboard.receivables")} value={money(owedTotal)} tone={owedTotal > 0 ? "warn" : undefined} sub={owed.length ? `${owed.length}` : undefined} />
          {isOwner && <Tile label={t("dashboard.stockValue")} value={money(stockValue)} />}
          {isOwner && <Tile label={t("dashboard.lowStockItems")} value={int(lowItems)} sub={`${t("dashboard.soldOut")}: ${int(outItems)}`} tone={lowItems ? "warn" : undefined} />}
        </div>

        <section className="card p-4">
          <h2 className="font-bold mb-1">{t("dashboard.perDay")}</h2>
          <p className="text-xs text-muted mb-3">{t("dashboard.last30")}</p>
          {live.length === 0 ? (
            <Empty>{t("dashboard.noData")}</Empty>
          ) : (
            <div className="h-44" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={perDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={4} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip formatter={(v) => money(Number(v))} labelFormatter={(l) => String(l)} cursor={{ fill: "rgba(15,118,110,0.08)" }} />
                  <Bar dataKey="revenue" fill="#0f766e" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {isOwner && bySeller.length > 0 && (
          <section className="card p-4">
            <h2 className="font-bold mb-3">{t("dashboard.bySeller")}</h2>
            <ul className="divide-y divide-line text-sm">
              {bySeller.map((s) => (
                <li key={s.name} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-semibold">{s.name}</p>
                    <p className="text-xs text-muted">
                      {int(s.count)} {t("dashboard.sales").toLowerCase()} · {int(s.units)} {t("common.pcs")}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="font-semibold">{money(s.revenue)}</p>
                    <p className="text-xs text-ok">{money(s.profit)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {owed.length > 0 && (
          <section className="card p-4">
            <h2 className="font-bold mb-3">{t("dashboard.receivables")}</h2>
            <ul className="divide-y divide-line text-sm">
              {owed.map((r) => (
                <li key={r.sale_id}>
                  <Link to={`/history/${r.sale_id}`} className="flex justify-between py-2">
                    <span>
                      #{r.sale_no} · {r.customer_name || t("history.walkIn")}
                    </span>
                    <span className="font-semibold text-warn">{money(r.due_usd)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {topItems.length > 0 && (
          <section className="card p-4">
            <h2 className="font-bold mb-3">{t("dashboard.topItems")}</h2>
            <ul className="divide-y divide-line text-sm">
              {topItems.map((x) => (
                <li key={x.id}>
                  <Link to={`/stock/${x.id}`} className="flex items-center gap-3 py-2">
                    <Photo path={x.item.photo_path} alt="" className="h-10 w-10 rounded-lg shrink-0" />
                    <div className="min-w-0 grow">
                      <p className="truncate font-medium">{itemName(x.item, i18n.language)}</p>
                      <p className="text-xs text-muted">
                        {shortRef(x.item.sheet_ref)} · {int(x.units)} {t("common.pcs")}
                      </p>
                    </div>
                    <span className="font-semibold">{money(x.revenue)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "ok" | "warn" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="card p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
    </div>
  );
}
