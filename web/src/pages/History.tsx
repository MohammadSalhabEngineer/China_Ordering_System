import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchSales, useAsync, personName, itemName } from "../lib/data";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { Empty, ErrorBox, Loading, PaymentBadge, Photo } from "../components/ui";
import { dateOnly, dayKey, money, relative } from "../lib/format";
import type { Profile, SaleWithLines } from "../types";

type Range = "all" | "7" | "30";

export default function HistoryPage() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const [seller, setSeller] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [range, setRange] = useState<Range>("30");
  const since = useMemo(() => (range === "all" ? undefined : new Date(Date.now() - Number(range) * 86400e3)), [range]);
  const sales = useAsync(() => fetchSales({ sellerId: seller || undefined, since, status: status || undefined }), [seller, status, since]);
  const people = useAsync(async () => {
    const { data } = await supabase.from("profiles").select("id, display_name, display_name_ar").order("display_name");
    return (data ?? []) as Pick<Profile, "id" | "display_name" | "display_name_ar">[];
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, SaleWithLines[]>();
    for (const s of sales.data ?? []) {
      const k = dayKey(s.sold_at);
      map.set(k, [...(map.get(k) ?? []), s]);
    }
    return Array.from(map.entries());
  }, [sales.data]);

  const sel = "input py-2 text-sm";
  return (
    <>
      <Header title={t("history.title")}>
        <div className="grid grid-cols-3 gap-2">
          <select className={sel} value={seller} onChange={(e) => setSeller(e.target.value)} aria-label={t("history.filterSeller")}>
            <option value="">{t("history.filterSeller")}: {t("common.all")}</option>
            {profile && <option value={profile.id}>{t("common.me")}</option>}
            {(people.data ?? [])
              .filter((p) => p.id !== profile?.id)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {personName(p, i18n.language)}
                </option>
              ))}
          </select>
          <select className={sel} value={status} onChange={(e) => setStatus(e.target.value)} aria-label={t("history.filterStatus")}>
            <option value="">{t("history.filterStatus")}: {t("common.all")}</option>
            <option value="unpaid">{t("payment.unpaid")}</option>
            <option value="partial">{t("payment.partial")}</option>
            <option value="paid">{t("payment.paid")}</option>
          </select>
          <select className={sel} value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label={t("history.filterDate")}>
            <option value="7">{t("history.last7")}</option>
            <option value="30">{t("history.last30")}</option>
            <option value="all">{t("history.allTime")}</option>
          </select>
        </div>
      </Header>

      {sales.loading && !sales.data ? (
        <Loading />
      ) : sales.error ? (
        <ErrorBox error={sales.error} onRetry={() => sales.reload()} />
      ) : grouped.length === 0 ? (
        <Empty>{t("history.noSales")}</Empty>
      ) : (
        <div className="p-3 space-y-4">
          {grouped.map(([day, list]) => (
            <section key={day}>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted mb-1.5 px-1 flex justify-between">
                <span>{dateOnly(list[0].sold_at, i18n.language)}</span>
                <span>{money(list.filter((s) => !s.voided).reduce((a, s) => a + Number(s.total_usd), 0))}</span>
              </h2>
              <ul className="space-y-2">
                {list.map((s) => (
                  <li key={s.id}>
                    <SaleRow sale={s} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

export function SaleRow({ sale: s }: { sale: SaleWithLines }) {
  const { t, i18n } = useTranslation();
  const lines = s.sale_lines ?? [];
  const units = lines.reduce((a, l) => a + l.qty, 0);
  const first = lines[0]?.items;
  return (
    <Link to={`/history/${s.id}`} className={`card flex gap-3 p-3 active:bg-brand-soft/40 ${s.voided ? "opacity-60" : ""}`}>
      <div className="relative shrink-0">
        <Photo path={first?.photo_path} alt="" className="h-16 w-16 rounded-lg" />
        {lines.length > 1 && <span className="absolute -bottom-1 -end-1 badge bg-ink text-white">+{lines.length - 1}</span>}
      </div>
      <div className="min-w-0 grow">
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold truncate">
            #{s.sale_no} · {s.customer_name || t("history.walkIn")}
          </p>
          <p className={`font-bold shrink-0 ${s.voided ? "line-through" : ""}`}>{money(s.total_usd)}</p>
        </div>
        <p className="text-sm text-muted truncate">
          {units} {t("common.pcs")} · {first ? itemName(first, i18n.language) : ""}
        </p>
        <p className="text-xs text-muted mt-1 flex items-center gap-2 flex-wrap">
          <span>{t("history.soldBy", { name: personName(s.profiles, i18n.language) })}</span>
          {s.location && <span>· {s.location}</span>}
          <span>· {relative(s.sold_at, i18n.language)}</span>
          {s.voided ? <span className="badge bg-line text-muted">{t("history.voided")}</span> : <PaymentBadge status={s.payment_status} />}
        </p>
      </div>
    </Link>
  );
}
