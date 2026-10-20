import { toPng } from "html-to-image";
import type { SaleWithLines } from "../types";
import { money } from "./format";

export type ReceiptLang = "en" | "ar";

/** Receipt wording is independent of the app language, so it has its own dictionary. */
export const RECEIPT_LABELS: Record<ReceiptLang, Record<string, string>> = {
  en: {
    receipt: "Receipt", date: "Date", seller: "Seller", phone: "Phone", customer: "Customer", location: "Location",
    item: "Item", qty: "Qty", price: "Price", total: "Total", paid: "Paid", due: "Remaining", note: "Note",
    thanks: "Thank you for your purchase", currency: "Prices in US dollars", code: "Code",
  },
  ar: {
    receipt: "فاتورة", date: "التاريخ", seller: "البائع", phone: "الهاتف", customer: "الزبون", location: "المكان",
    item: "الصنف", qty: "الكمية", price: "السعر", total: "المجموع", paid: "المدفوع", due: "المتبقي", note: "ملاحظة",
    thanks: "شكراً لتسوقكم معنا", currency: "الأسعار بالدولار الأمريكي", code: "الرمز",
  },
};

export function receiptDate(iso: string, lang: ReceiptLang): string {
  return new Date(iso).toLocaleString(lang === "ar" ? "ar-LB-u-nu-latn" : "en-GB", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function lineName(l: SaleWithLines["sale_lines"][number], lang: ReceiptLang): string {
  const it = l.items;
  return (lang === "ar" ? it.description_ar : it.description_en) || it.description_en || it.description_ar || it.item_no || it.sheet_ref;
}

export function sellerName(sale: SaleWithLines, lang: ReceiptLang): string {
  const p = sale.profiles;
  if (!p) return "";
  return (lang === "ar" && p.display_name_ar) || p.display_name;
}

/** Plain-text receipt for pasting into WhatsApp / SMS. */
export function receiptText(sale: SaleWithLines, lang: ReceiptLang, shopName: string): string {
  const L = RECEIPT_LABELS[lang];
  const due = Number(sale.total_usd) - Number(sale.paid_usd);
  const out: string[] = [];
  if (shopName) out.push(shopName);
  out.push(`${L.receipt} #${sale.sale_no}`, `${L.date}: ${receiptDate(sale.sold_at, lang)}`);
  const seller = sellerName(sale, lang);
  if (seller) out.push(`${L.seller}: ${seller}${sale.profiles?.phone ? ` · ${sale.profiles.phone}` : ""}`);
  if (sale.customer_name) out.push(`${L.customer}: ${sale.customer_name}${sale.location ? ` · ${sale.location}` : ""}`);
  out.push("");
  for (const l of sale.sale_lines) {
    const code = l.items.item_no ? `[${l.items.item_no}] ` : "";
    out.push(`${code}${lineName(l, lang)}`, `   ${l.qty} × ${money(l.unit_price_usd)} = ${money(l.line_total)}`);
  }
  out.push("", `${L.total}: ${money(sale.total_usd)}`, `${L.paid}: ${money(sale.paid_usd)}`);
  if (due > 0.004) out.push(`${L.due}: ${money(due)}`);
  if (sale.note) out.push(`${L.note}: ${sale.note}`);
  out.push("", L.thanks);
  return out.join("\n");
}

export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/** Renders the preview element to a PNG data URL (2x for crisp text). */
export async function nodeToPng(el: HTMLElement): Promise<{ dataUrl: string; width: number; height: number }> {
  const opts = { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true };
  // Safari sometimes returns a blank first render; a second pass is reliable.
  await toPng(el, opts);
  const dataUrl = await toPng(el, opts);
  return { dataUrl, width: el.offsetWidth, height: el.offsetHeight };
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:(.*?);/.exec(head)?.[1] ?? "image/png";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function download(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/** Opens the phone's share sheet with the receipt image; falls back to a download on desktop. */
export async function sharePng(dataUrl: string, filename: string, title: string): Promise<"shared" | "downloaded"> {
  const blob = dataUrlToBlob(dataUrl);
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "shared";
    }
  }
  download(blob, filename);
  return "downloaded";
}

/** Wraps the PNG into a single-page PDF sized to the receipt. */
export async function downloadPdf(dataUrl: string, width: number, height: number, filename: string): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const pageW = 148; // A5 width in mm
  const pageH = Math.max(100, (height / width) * pageW);
  const pdf = new jsPDF({ unit: "mm", format: [pageW, pageH], orientation: "portrait" });
  pdf.addImage(dataUrl, "PNG", 0, 0, pageW, (height / width) * pageW);
  pdf.save(filename);
}
