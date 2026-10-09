import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Ban, BadgeDollarSign, Smartphone, User, MapPin } from "lucide-react";
import { fetchSale, useAsync, personName, itemName, shortRef } from "../lib/data";
import { supabase, explainError } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { ErrorBox, Field, Loading, PaymentBadge, Photo, Sheet, Spinner, Toast } from "../components/ui";
import { dateTime, money } from "../lib/format";

export default function SalePage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation();
  const { isOwner, profile, deviceId } = useAuth();
  const sale = useAsync(() => fetchSale(id), [id]);
  const payments = useAsync(async () => {
    const { data } = await supabase
      .from("payments")
      .select("id, amount_usd, paid_at, note, profiles:recorded_by(display_name, display_name_ar)")
      .eq("sale_id", id)
      .order("paid_at");
    return (data ?? []) as unknown as { id: string; amount_usd: number; paid_at: string; note: string | null; profiles: { display_name: string; display_name_ar: string | null } | null }[];
  }, [id]);
  const [voiding, setVoiding] = useState(false);
  const [paying, setPaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (sale.loading && !sale.data) return <Loading />;
  if (sale.error || !sale.data) return <ErrorBox error={sale.error} onRetry={() => sale.reload()} />;
  const s = sale.data;
  const due = Number(s.total_usd) - Number(s.paid_usd);
  const within24h = Date.now() - new Date(s.created_at).getTime() < 24 * 3600e3;
  const canVoid = !s.voided && (isOwner || (profile?.id === s.seller_id && within24h));
  const cost = s.sale_lines.reduce((a, l) => a + l.qty * Number(l.unit_cost_usd), 0);

  const refresh = () => {
    void sale.reload(true);
    void payments.reload(true);
  };

  return (
    <>
      <Header title={t("history.receipt", { no: s.sale_no })} back />
      <div className="p-4 space-y-4">
        {s.voided && (
          <p className="rounded-xl bg-line p-3 text-sm text-muted">
            {t("history.voidedBy", { name: "", reason: s.void_reason ?? "" }).replace(/^[^:]*:/, t("history.voided") + ":")}
          </p>
        )}
        <div className="card p-4 text-sm space-y-2">
          <Row icon={<User size={16} />} text={`${t("history.soldBy", { name: personName(s.profiles, i18n.language) })} · ${dateTime(s.sold_at, i18n.language)}`} />
          <Row icon={<Smartphone size={16} />} text={s.devices ? `${s.devices.nickname}${s.devices.device_label ? ` (${s.devices.device_label})` : ""}` : t("history.unknownDevice")} />
          {(s.customer_name || s.location) && (
            <Row icon={<MapPin size={16} />} text={[s.customer_name, s.location].filter(Boolean).join(" · ")} />
          )}
          {s.note && <p className="text-muted">{s.note}</p>}
        </div>

        <ul className="card divide-y divide-line">
          {s.sale_lines.map((l) => (
            <li key={l.id} className="flex items-center gap-3 p-3">
              <Photo path={l.items.photo_path} alt="" className="h-14 w-14 rounded-lg shrink-0" />
              <Link to={`/stock/${l.item_id}`} className="min-w-0 grow">
                <p className="text-sm font-medium truncate">{itemName(l.items, i18n.language)}</p>
                <p className="text-xs text-muted">
                  {shortRef(l.items.sheet_ref)} · {l.qty} × {money(l.unit_price_usd)}
                </p>
              </Link>
              <span className="font-semibold">{money(l.line_total)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between p-3 text-lg font-bold">
            <span>{t("common.total")}</span>
            <span className={s.voided ? "line-through" : ""}>{money(s.total_usd)}</span>
          </li>
          {isOwner && !s.voided && (
            <li className="flex items-center justify-between p-3 text-sm text-muted">
              <span>{t("dashboard.profit")}</span>
              <span className="text-ok font-semibold">{money(Number(s.total_usd) - cost)}</span>
            </li>
          )}
        </ul>

        {!s.voided && (
          <div className="card p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">{t("history.payments")}</span>
              <PaymentBadge status={s.payment_status} />
            </div>
            <ul className="text-sm divide-y divide-line">
              {(payments.data ?? []).map((p) => (
                <li key={p.id} className="flex justify-between py-1.5">
                  <span className="text-muted">
                    {dateTime(p.paid_at, i18n.language)} · {personName(p.profiles, i18n.language)}
                    {p.note ? ` · ${p.note}` : ""}
                  </span>
                  <span className="font-medium">{money(p.amount_usd)}</span>
                </li>
              ))}
            </ul>
            {due > 0.004 && (
              <>
                <p className="text-warn font-semibold mt-2">{t("history.due", { amount: money(due) })}</p>
                <button className="btn-primary w-full mt-3" onClick={() => setPaying(true)}>
                  <BadgeDollarSign size={18} /> {t("history.addPayment")}
                </button>
              </>
            )}
          </div>
        )}

        {canVoid && (
          <button className="btn-secondary w-full text-bad" onClick={() => setVoiding(true)}>
            <Ban size={18} /> {t("history.void")}
          </button>
        )}
      </div>

      <VoidSheet open={voiding} saleId={s.id} deviceId={deviceId} onClose={() => setVoiding(false)} onDone={() => { setVoiding(false); setToast(t("history.voided")); refresh(); }} />
      <PaySheet open={paying} saleId={s.id} due={due} deviceId={deviceId} onClose={() => setPaying(false)} onDone={() => { setPaying(false); refresh(); }} />
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <p className="flex items-center gap-2">
      <span className="text-muted">{icon}</span>
      <span>{text}</span>
    </p>
  );
}

function VoidSheet({ open, saleId, deviceId, onClose, onDone }: { open: boolean; saleId: string; deviceId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!reason.trim()) return setError(t("errors.required"));
    setBusy(true);
    const { error } = await supabase.rpc("void_sale", { p_sale_id: saleId, p_reason: reason.trim(), p_device_id: deviceId });
    setBusy(false);
    if (error) {
      const ex = explainError(error);
      return setError(t(ex.key, ex.args));
    }
    onDone();
  }
  return (
    <Sheet open={open} onClose={onClose} title={t("history.void")}>
      <p className="text-sm text-muted mb-4">{t("history.voidConfirm")}</p>
      <form onSubmit={submit}>
        <Field label={t("history.voidReason")}>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
        </Field>
        {error && <p className="text-bad text-sm mb-3">{error}</p>}
        <button className="btn-danger w-full" disabled={busy}>
          {busy ? <Spinner className="text-white" /> : t("common.confirm")}
        </button>
      </form>
    </Sheet>
  );
}

function PaySheet({ open, saleId, due, deviceId, onClose, onDone }: { open: boolean; saleId: string; due: number; deviceId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [amount, setAmount] = useState(due.toFixed(2));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const a = parseFloat(amount);
    if (!a) return setError(t("errors.required"));
    setBusy(true);
    const { error } = await supabase.rpc("record_payment", { p_sale_id: saleId, p_amount: a, p_device_id: deviceId, p_note: note || null });
    setBusy(false);
    if (error) {
      const ex = explainError(error);
      return setError(t(ex.key, ex.args));
    }
    onDone();
  }
  return (
    <Sheet open={open} onClose={onClose} title={t("history.addPayment")}>
      <form onSubmit={submit}>
        <Field label={t("history.paymentAmount")}>
          <div className="relative">
            <span className="absolute start-4 top-1/2 -translate-y-1/2 text-muted">$</span>
            <input className="input ps-8 text-lg" type="number" inputMode="decimal" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
          </div>
        </Field>
        <Field label={`${t("sell.note")} (${t("common.optional")})`}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <p className="text-bad text-sm mb-3">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner className="text-white" /> : t("common.save")}
        </button>
      </form>
    </Sheet>
  );
}
