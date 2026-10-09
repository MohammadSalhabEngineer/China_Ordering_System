import { supabase } from "./supabase";

/** Downloads one .xlsx with four sheets: Sales, Sale lines, Stock, Movements. */
export async function exportWorkbook(locale: string) {
  const ExcelJS = (await import("exceljs")).default;
  const ar = locale === "ar";

  const [sales, lines, items, moves, people, devices] = await Promise.all([
    supabase.from("sales").select("*").order("sold_at"),
    supabase.from("sale_lines").select("*, items(sheet_ref, item_no, description_en, description_ar), sales(sale_no, sold_at, voided)").order("sale_id"),
    supabase.from("items").select("*").order("page_no").order("sheet_ref"),
    supabase.from("stock_movements").select("*, items(sheet_ref)").order("created_at"),
    supabase.from("profiles").select("id, display_name, display_name_ar"),
    supabase.from("devices").select("id, nickname, device_label"),
  ]);
  for (const r of [sales, lines, items, moves, people, devices]) if (r.error) throw new Error(r.error.message);

  const who = new Map((people.data ?? []).map((p) => [p.id, (ar && p.display_name_ar) || p.display_name]));
  const dev = new Map((devices.data ?? []).map((d) => [d.id, `${d.nickname}${d.device_label ? ` (${d.device_label})` : ""}`]));
  const name = (it: { description_en: string | null; description_ar: string | null; item_no: string | null; sheet_ref: string } | null) =>
    it ? ((ar ? it.description_ar : it.description_en) || it.description_en || it.description_ar || it.item_no || it.sheet_ref) : "";
  const dt = (iso: string) => new Date(iso);

  const CANCELLED = ar ? "ملغاة" : "CANCELLED";
  /** Paint cancelled rows light red with dark-red text so they can't be mistaken for real sales. */
  const markCancelled = (ws: import("exceljs").Worksheet, flags: boolean[]) => {
    flags.forEach((v, i) => {
      if (!v) return;
      const row = ws.getRow(i + 2);
      row.eachCell({ includeEmpty: true }, (c) => {
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E2" } };
        c.font = { color: { argb: "FFB91C1C" } };
      });
    });
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Container Sales";
  const money = "$#,##0.00";

  const s1 = wb.addWorksheet(ar ? "المبيعات" : "Sales", { views: [{ rightToLeft: ar }] });
  s1.columns = [
    { header: "#", key: "no", width: 7 },
    { header: ar ? "التاريخ" : "Date", key: "date", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: ar ? "البائع" : "Seller", key: "seller", width: 14 },
    { header: ar ? "الجهاز" : "Device", key: "device", width: 26 },
    { header: ar ? "الزبون" : "Customer", key: "customer", width: 18 },
    { header: ar ? "المكان" : "Location", key: "location", width: 14 },
    { header: ar ? "المجموع" : "Total", key: "total", width: 12, style: { numFmt: money } },
    { header: ar ? "المدفوع" : "Paid", key: "paid", width: 12, style: { numFmt: money } },
    { header: ar ? "الحالة" : "Status", key: "status", width: 10 },
    { header: ar ? "ملغاة" : "Cancelled", key: "voided", width: 11 },
    { header: ar ? "سبب الإلغاء" : "Cancel reason", key: "reason", width: 24 },
    { header: ar ? "ملاحظة" : "Note", key: "note", width: 24 },
  ];
  for (const s of sales.data ?? [])
    s1.addRow({
      no: s.sale_no, date: dt(s.sold_at), seller: who.get(s.seller_id) ?? "", device: s.device_id ? dev.get(s.device_id) ?? "" : "",
      customer: s.customer_name ?? "", location: s.location ?? "", total: Number(s.total_usd), paid: Number(s.paid_usd),
      status: s.payment_status, voided: s.voided ? CANCELLED : "", reason: s.void_reason ?? "", note: s.note ?? "",
    });
  markCancelled(s1, (sales.data ?? []).map((s) => s.voided));

  const s2 = wb.addWorksheet(ar ? "الأصناف المباعة" : "Sale lines", { views: [{ rightToLeft: ar }] });
  s2.columns = [
    { header: "#", key: "no", width: 7 },
    { header: ar ? "التاريخ" : "Date", key: "date", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: ar ? "رقم الجدول" : "Sheet ref", key: "ref", width: 12 },
    { header: ar ? "الرمز" : "Code", key: "code", width: 12 },
    { header: ar ? "الصنف" : "Item", key: "item", width: 36 },
    { header: ar ? "الكمية" : "Qty", key: "qty", width: 8 },
    { header: ar ? "سعر القطعة" : "Unit price", key: "price", width: 12, style: { numFmt: money } },
    { header: ar ? "تكلفة القطعة" : "Unit cost", key: "cost", width: 12, style: { numFmt: money } },
    { header: ar ? "المجموع" : "Line total", key: "total", width: 12, style: { numFmt: money } },
    { header: ar ? "الربح" : "Profit", key: "profit", width: 12, style: { numFmt: money } },
    { header: ar ? "ملغاة" : "Cancelled", key: "voided", width: 11 },
  ];
  const lineVoided: boolean[] = [];
  for (const l of lines.data ?? []) {
    const it = l.items as { sheet_ref: string; item_no: string | null; description_en: string | null; description_ar: string | null } | null;
    const sale = l.sales as { sale_no: number; sold_at: string; voided: boolean } | null;
    s2.addRow({
      no: sale?.sale_no, date: sale ? dt(sale.sold_at) : null, ref: it?.sheet_ref ?? "", code: it?.item_no ?? "", item: name(it),
      qty: l.qty, price: Number(l.unit_price_usd), cost: Number(l.unit_cost_usd), total: Number(l.line_total),
      profit: l.qty * (Number(l.unit_price_usd) - Number(l.unit_cost_usd)), voided: sale?.voided ? CANCELLED : "",
    });
    lineVoided.push(Boolean(sale?.voided));
  }
  markCancelled(s2, lineVoided);

  const s3 = wb.addWorksheet(ar ? "المخزون" : "Stock", { views: [{ rightToLeft: ar }] });
  s3.columns = [
    { header: ar ? "رقم الجدول" : "Sheet ref", key: "ref", width: 12 },
    { header: ar ? "الرمز" : "Code", key: "code", width: 12 },
    { header: ar ? "الصنف" : "Item", key: "item", width: 36 },
    { header: ar ? "الفئة" : "Category", key: "cat", width: 12 },
    { header: ar ? "الكمية الأولية" : "Initial", key: "initial", width: 10 },
    { header: ar ? "المتبقي" : "In stock", key: "stock", width: 10 },
    { header: ar ? "التكلفة" : "Cost", key: "cost", width: 10, style: { numFmt: money } },
    { header: ar ? "التكلفة مع الشحن" : "Landed cost", key: "landed", width: 12, style: { numFmt: money } },
    { header: ar ? "سعر البيع" : "Sell price", key: "price", width: 10, style: { numFmt: money } },
    { header: ar ? "قيمة المخزون" : "Stock value", key: "value", width: 12, style: { numFmt: money } },
    { header: ar ? "ملاحظة" : "Note", key: "note", width: 30 },
  ];
  for (const it of items.data ?? [])
    s3.addRow({
      ref: it.sheet_ref, code: it.item_no ?? "", item: name(it), cat: it.category ?? "", initial: it.initial_qty, stock: it.stock_qty,
      cost: Number(it.cost_usd), landed: it.landed_cost_usd == null ? null : Number(it.landed_cost_usd), price: Number(it.default_price_usd),
      value: it.stock_qty * Number(it.landed_cost_usd ?? it.cost_usd), note: it.needs_review ?? "",
    });

  const s4 = wb.addWorksheet(ar ? "الحركات" : "Movements", { views: [{ rightToLeft: ar }] });
  s4.columns = [
    { header: ar ? "التاريخ" : "Date", key: "date", width: 18, style: { numFmt: "yyyy-mm-dd hh:mm" } },
    { header: ar ? "رقم الجدول" : "Sheet ref", key: "ref", width: 12 },
    { header: ar ? "التغيير" : "Change", key: "delta", width: 8 },
    { header: ar ? "السبب" : "Reason", key: "reason", width: 12 },
    { header: ar ? "الشخص" : "Person", key: "who", width: 14 },
    { header: ar ? "الجهاز" : "Device", key: "device", width: 26 },
    { header: ar ? "ملاحظة" : "Note", key: "note", width: 30 },
  ];
  for (const m of moves.data ?? [])
    s4.addRow({
      date: dt(m.created_at), ref: (m.items as { sheet_ref: string } | null)?.sheet_ref ?? "", delta: m.delta, reason: m.reason,
      who: m.user_id ? who.get(m.user_id) ?? "" : "", device: m.device_id ? dev.get(m.device_id) ?? "" : "", note: m.note ?? "",
    });

  for (const ws of [s1, s2, s3, s4]) {
    ws.getRow(1).font = { bold: true };
    ws.views = [{ rightToLeft: ar, state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `container-sales-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
