import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Pencil, SlidersHorizontal, Camera, Image as ImageIcon, Trash2 } from "lucide-react";
import { fetchItem, fetchMovements, useAsync, itemName, personName, shortRef } from "../lib/data";
import { supabase, explainError } from "../lib/supabase";
import { uploadItemPhoto, removeItemPhoto } from "../lib/photos";
import { useAuth } from "../lib/auth";
import { Header } from "../components/Header";
import { ErrorBox, Field, Loading, Photo, Sheet, Spinner, StockBadge, Toast } from "../components/ui";
import { dateTime, int, money } from "../lib/format";
import type { Item } from "../types";

export default function ItemPage() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation();
  const { isOwner, deviceId } = useAuth();
  const item = useAsync(() => fetchItem(id), [id]);
  const moves = useAsync(() => fetchMovements(id), [id]);
  const [adjust, setAdjust] = useState(false);
  const [edit, setEdit] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (item.loading && !item.data) return <Loading />;
  if (item.error || !item.data) return <ErrorBox error={item.error} onRetry={() => item.reload()} />;
  const it = item.data;
  const cost = Number(it.landed_cost_usd ?? it.cost_usd);
  // net sold = units sold minus units returned by cancelled sales
  const sold = (moves.data ?? []).reduce((s, m) => (m.reason === "sale" ? s - m.delta : m.reason === "void" ? s - m.delta : s), 0);

  function refresh() {
    void item.reload(true);
    void moves.reload(true);
  }

  return (
    <>
      <Header
        title={shortRef(it.sheet_ref)}
        back
        right={
          isOwner ? (
            <button className="btn-ghost" onClick={() => setEdit(true)}>
              <Pencil size={18} /> {t("common.edit")}
            </button>
          ) : undefined
        }
      />
      <Photo path={it.photo_path} alt={itemName(it, i18n.language)} className="w-full aspect-square max-h-[60vw] sm:max-h-80 object-contain bg-white" />
      {isOwner && (
        <PhotoEditor
          item={it}
          onChanged={(msg) => {
            setToast(msg);
            refresh();
          }}
        />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold leading-snug">{itemName(it, i18n.language)}</h2>
            <p className="text-sm text-muted mt-1">
              {it.sheet_ref}
              {it.item_no ? ` · ${it.item_no}` : ""}
              {it.category ? ` · ${t(`categories.${it.category}`, { defaultValue: it.category })}` : ""}
            </p>
            {it.description_zh && <p className="text-xs text-muted mt-1">{t("stock.chinese")}: {it.description_zh}</p>}
          </div>
          <StockBadge stock={it.stock_qty} initial={it.initial_qty} />
        </div>
        {it.needs_review && <p className="mt-3 rounded-xl bg-amber-50 text-warn text-sm p-3">{t("stock.needsReview", { note: it.needs_review })}</p>}

        <dl className="card mt-4 grid grid-cols-2 gap-x-4 gap-y-3 p-4 text-sm">
          <Stat label={t("stock.left", { count: it.stock_qty })} value={`${int(it.stock_qty)} / ${int(it.initial_qty)}`} />
          <Stat label={t("stock.sold", { count: sold })} value={int(sold)} />
          <Stat label={t("stock.sellPrice")} value={money(it.default_price_usd)} />
          {isOwner && <Stat label={t("stock.landedCost")} value={money(cost)} />}
          {isOwner && <Stat label={t("stock.profitPerPc")} value={money(Number(it.default_price_usd) - cost)} />}
          {isOwner && it.landed_cost_usd != null && <Stat label={t("stock.goodsCost")} value={money(it.cost_usd)} />}
          {it.cartons != null && <Stat label={t("stock.cartons")} value={`${int(it.cartons)} × ${int(it.qty_per_carton)} ${t("stock.perCarton")}`} />}
          {it.page_no != null && <Stat label={t("stock.sheetRef")} value={t("stock.page", { page: it.page_no })} />}
        </dl>

        {isOwner && (
          <button className="btn-secondary w-full mt-4" onClick={() => setAdjust(true)}>
            <SlidersHorizontal size={18} /> {t("stock.adjust")}
          </button>
        )}

        <h3 className="font-bold mt-6 mb-2">{t("stock.movements")}</h3>
        {moves.loading && !moves.data ? (
          <Loading />
        ) : (
          <ul className="card divide-y divide-line">
            {(moves.data ?? []).map((m) => (
              <li key={m.id} className="p-3 text-sm flex items-center gap-3">
                <span className={`font-bold text-base w-12 text-center ${m.delta < 0 ? "text-bad" : "text-ok"}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                <div className="min-w-0 grow">
                  <p className="font-medium">
                    {t(`stock.reasons.${m.reason}`)}
                    {m.ref_sale_id && (
                      <Link to={`/history/${m.ref_sale_id}`} className="text-brand ms-2 underline">
                        {t("history.viewReceipt")}
                      </Link>
                    )}
                  </p>
                  <p className="text-xs text-muted truncate">
                    {m.profiles ? personName(m.profiles, i18n.language) : "—"}
                    {m.devices ? ` · ${m.devices.nickname}` : ""}
                    {m.note ? ` · ${m.note}` : ""}
                  </p>
                </div>
                <span className="text-xs text-muted shrink-0">{dateTime(m.created_at, i18n.language)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {isOwner && (
        <AdjustSheet
          open={adjust}
          item={it}
          deviceId={deviceId}
          onClose={() => setAdjust(false)}
          onDone={() => {
            setAdjust(false);
            setToast(t("common.save"));
            refresh();
          }}
        />
      )}
      {isOwner && (
        <EditSheet
          open={edit}
          item={it}
          onClose={() => setEdit(false)}
          onDone={() => {
            setEdit(false);
            refresh();
          }}
        />
      )}
      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}

/** Owner-only: replace the photo from the camera or gallery, or remove it. */
function PhotoEditor({ item, onChanged }: { item: Item; onChanged: (msg: string) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await uploadItemPhoto(item.id, item.sheet_ref, file);
      onChanged(t("common.save"));
    } catch (err) {
      const ex = explainError(err);
      setError(t(ex.key, ex.args));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(t("stock.removePhoto") + "?")) return;
    setBusy(true);
    setError(null);
    try {
      await removeItemPhoto(item.id, item.photo_path);
      onChanged(t("stock.removePhoto"));
    } catch (err) {
      const ex = explainError(err);
      setError(t(ex.key, ex.args));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pt-3">
      <div className="flex gap-2">
        <label className={`btn-secondary grow text-sm ${busy ? "opacity-50 pointer-events-none" : ""}`}>
          <Camera size={18} /> {t("stock.takePhoto")}
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} disabled={busy} />
        </label>
        <label className={`btn-secondary grow text-sm ${busy ? "opacity-50 pointer-events-none" : ""}`}>
          <ImageIcon size={18} /> {t("stock.choosePhoto")}
          <input type="file" accept="image/*" className="hidden" onChange={onFile} disabled={busy} />
        </label>
        {item.photo_path && (
          <button className="btn-secondary text-bad text-sm" onClick={remove} disabled={busy} aria-label={t("stock.removePhoto")}>
            <Trash2 size={18} />
          </button>
        )}
      </div>
      {busy && (
        <p className="text-xs text-muted mt-2 flex items-center gap-2">
          <Spinner className="!w-4 !h-4" /> {t("stock.uploading")}
        </p>
      )}
      {error && <p className="text-xs text-bad mt-2">{error}</p>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function AdjustSheet({ open, item, deviceId, onClose, onDone }: { open: boolean; item: Item; deviceId: string; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<"adjustment" | "return" | "damaged">("adjustment");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const d = parseInt(delta, 10);
    if (!d) return setError(t("errors.required"));
    setBusy(true);
    const { error } = await supabase.rpc("adjust_stock", { p_item_id: item.id, p_delta: d, p_reason: reason, p_note: note || null, p_device_id: deviceId });
    setBusy(false);
    if (error) {
      const ex = explainError(error);
      return setError(t(ex.key, ex.args));
    }
    setDelta("");
    setNote("");
    onDone();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("stock.adjust")}>
      <p className="text-sm text-muted mb-4">{t("stock.adjustHint")}</p>
      <form onSubmit={submit}>
        <Field label={t("stock.delta")}>
          <input className="input text-lg" type="number" inputMode="numeric" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="-3" autoFocus />
        </Field>
        <Field label={t("stock.reason")}>
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            <option value="adjustment">{t("stock.reasons.adjustment")}</option>
            <option value="return">{t("stock.reasons.return")}</option>
            <option value="damaged">{t("stock.reasons.damaged")}</option>
          </select>
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

function EditSheet({ open, item, onClose, onDone }: { open: boolean; item: Item; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [f, setF] = useState({
    description_en: item.description_en ?? "",
    description_ar: item.description_ar ?? "",
    item_no: item.item_no ?? "",
    default_price_usd: String(item.default_price_usd),
    cost_usd: String(item.cost_usd),
    landed_cost_usd: item.landed_cost_usd == null ? "" : String(item.landed_cost_usd),
    needs_review: item.needs_review ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase
      .from("items")
      .update({
        description_en: f.description_en.trim() || null,
        description_ar: f.description_ar.trim() || null,
        item_no: f.item_no.trim() || null,
        default_price_usd: parseFloat(f.default_price_usd) || 0,
        cost_usd: parseFloat(f.cost_usd) || 0,
        landed_cost_usd: f.landed_cost_usd === "" ? null : parseFloat(f.landed_cost_usd) || 0,
        needs_review: f.needs_review.trim() || null,
      })
      .eq("id", item.id);
    setBusy(false);
    if (error) {
      const ex = explainError(error);
      return setError(t(ex.key, ex.args));
    }
    onDone();
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("stock.editItem")} tall>
      <form onSubmit={submit}>
        <Field label={t("stock.nameEn")}>
          <input className="input" dir="ltr" value={f.description_en} onChange={set("description_en")} />
        </Field>
        <Field label={t("stock.nameAr")}>
          <input className="input" dir="rtl" value={f.description_ar} onChange={set("description_ar")} />
        </Field>
        <Field label={t("stock.code")}>
          <input className="input" dir="ltr" value={f.item_no} onChange={set("item_no")} />
        </Field>
        <Field label={t("stock.sellPrice")}>
          <input className="input" type="number" inputMode="decimal" step="0.01" value={f.default_price_usd} onChange={set("default_price_usd")} />
        </Field>
        <Field label={t("stock.landedCost")} hint={t("stock.profitPerPc") + " = " + t("stock.sellPrice") + " − " + t("stock.landedCost")}>
          <input className="input" type="number" inputMode="decimal" step="0.01" value={f.landed_cost_usd} onChange={set("landed_cost_usd")} />
        </Field>
        <Field label={`${t("stock.goodsCost")} (${t("common.optional")})`}>
          <input className="input" type="number" inputMode="decimal" step="0.01" value={f.cost_usd} onChange={set("cost_usd")} />
        </Field>
        <Field label={`${t("sell.note")} (${t("common.optional")})`}>
          <input className="input" value={f.needs_review} onChange={set("needs_review")} />
        </Field>
        {error && <p className="text-bad text-sm mb-3">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? <Spinner className="text-white" /> : t("common.save")}
        </button>
      </form>
    </Sheet>
  );
}
