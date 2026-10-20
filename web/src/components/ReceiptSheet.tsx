import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Share2, FileDown } from "lucide-react";
import type { SaleWithLines } from "../types";
import { Sheet, Spinner } from "./ui";
import { money } from "../lib/format";
import { RECEIPT_LABELS, copyText, downloadPdf, lineName, nodeToPng, receiptDate, receiptText, sellerName, sharePng, type ReceiptLang } from "../lib/receipt";

export function ReceiptSheet({
  open,
  sale,
  shopName,
  onClose,
  onToast,
}: {
  open: boolean;
  sale: SaleWithLines;
  shopName: string;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [lang, setLang] = useState<ReceiptLang>(i18n.language === "ar" ? "ar" : "en");
  const [busy, setBusy] = useState<"img" | "pdf" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const L = RECEIPT_LABELS[lang];
  const due = Number(sale.total_usd) - Number(sale.paid_usd);
  const seller = sellerName(sale, lang);
  const filename = `receipt-${sale.sale_no}`;

  async function render() {
    if (!ref.current) throw new Error("no preview");
    return nodeToPng(ref.current);
  }

  async function onCopy() {
    await copyText(receiptText(sale, lang, shopName));
    onToast(t("receipt.copied"));
  }
  async function onShare() {
    setBusy("img");
    try {
      const { dataUrl } = await render();
      await sharePng(dataUrl, `${filename}.png`, `${L.receipt} #${sale.sale_no}`);
    } catch (e) {
      onToast(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }
  async function onPdf() {
    setBusy("pdf");
    try {
      const { dataUrl, width, height } = await render();
      await downloadPdf(dataUrl, width, height, `${filename}.pdf`);
    } catch (e) {
      onToast(String((e as Error).message ?? e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={t("receipt.share")} tall>
      <div className="flex items-center justify-between mb-3">
        <span className="label mb-0">{t("receipt.language")}</span>
        <div className="inline-flex rounded-xl border border-line overflow-hidden" dir="ltr">
          {(["en", "ar"] as ReceiptLang[]).map((l) => (
            <button
              key={l}
              className={`px-4 py-1.5 text-sm font-semibold ${lang === l ? "bg-brand text-white" : "bg-white text-ink"}`}
              onClick={() => setLang(l)}
            >
              {l === "en" ? "English" : "العربية"}
            </button>
          ))}
        </div>
      </div>

      {/* The preview is what gets turned into the image / PDF, so it uses plain inline sizes. */}
      <div className="overflow-x-auto -mx-4 px-4 pb-2">
        {/* centering lives on this wrapper, not on the captured node: html-to-image would copy
            a resolved auto margin onto the clone and shift the receipt out of the capture */}
        <div className="w-fit mx-auto">
        <div
          ref={ref}
          dir={lang === "ar" ? "rtl" : "ltr"}
          lang={lang}
          style={{ width: 380, fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, 'Noto Sans Arabic', sans-serif" }}
          className="bg-white text-ink rounded-xl border border-line p-5 text-[13px] leading-snug [overflow-wrap:anywhere]"
        >
          <div className="text-center mb-3">
            {shopName && <p className="text-lg font-bold">{shopName}</p>}
            <p className="font-semibold">
              {L.receipt} #{sale.sale_no}
            </p>
            <p className="text-muted text-xs">{receiptDate(sale.sold_at, lang)}</p>
          </div>

          <div className="text-xs text-muted mb-3 space-y-0.5">
            {seller && (
              <p>
                {L.seller}: <span className="text-ink">{seller}</span>
                {sale.profiles?.phone && (
                  <>
                    {" · "}
                    {L.phone}: <span className="text-ink" dir="ltr">{sale.profiles.phone}</span>
                  </>
                )}
              </p>
            )}
            {sale.customer_name && (
              <p>
                {L.customer}: <span className="text-ink">{sale.customer_name}</span>
                {sale.location && (
                  <>
                    {" · "}
                    {L.location}: <span className="text-ink">{sale.location}</span>
                  </>
                )}
              </p>
            )}
          </div>

          <table className="w-full border-collapse">
            <thead>
              <tr className="border-y border-line text-xs text-muted">
                <th className="text-start py-1.5 font-medium">{L.item}</th>
                <th className="text-center py-1.5 font-medium w-10">{L.qty}</th>
                <th className="text-end py-1.5 font-medium w-16">{L.price}</th>
                <th className="text-end py-1.5 font-medium w-18">{L.total}</th>
              </tr>
            </thead>
            <tbody>
              {sale.sale_lines.map((l) => (
                <tr key={l.id} className="border-b border-line/70 align-top">
                  <td className="py-1.5 pe-2">
                    <div>{lineName(l, lang)}</div>
                    {l.items.item_no && (
                      <div className="text-[10px] text-muted">
                        <span dir="ltr">{l.items.item_no}</span>
                      </div>
                    )}
                  </td>
                  <td className="py-1.5 text-center">{l.qty}</td>
                  <td className="py-1.5 text-end whitespace-nowrap">{money(l.unit_price_usd)}</td>
                  <td className="py-1.5 text-end whitespace-nowrap font-medium">{money(l.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-3 space-y-1">
            <div className="flex justify-between text-base font-bold">
              <span>{L.total}</span>
              <span>{money(sale.total_usd)}</span>
            </div>
            <div className="flex justify-between">
              <span>{L.paid}</span>
              <span>{money(sale.paid_usd)}</span>
            </div>
            {due > 0.004 && (
              <div className="flex justify-between font-semibold text-bad">
                <span>{L.due}</span>
                <span>{money(due)}</span>
              </div>
            )}
          </div>
          {sale.note && (
            <p className="mt-2 text-xs text-muted">
              {L.note}: {sale.note}
            </p>
          )}
          <p className="mt-4 text-center text-xs text-muted">{L.thanks}</p>
          <p className="text-center text-[10px] text-muted">{L.currency}</p>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <button className="btn-secondary text-sm" onClick={onCopy} disabled={busy !== null}>
          <Copy size={18} /> {t("receipt.copy")}
        </button>
        <button className="btn-primary text-sm" onClick={onShare} disabled={busy !== null}>
          {busy === "img" ? <Spinner className="text-white !w-5 !h-5" /> : <Share2 size={18} />} {t("receipt.shareImage")}
        </button>
        <button className="btn-secondary text-sm" onClick={onPdf} disabled={busy !== null}>
          {busy === "pdf" ? <Spinner className="!w-5 !h-5" /> : <FileDown size={18} />} {t("receipt.downloadPdf")}
        </button>
      </div>
    </Sheet>
  );
}
