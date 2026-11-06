"""Builds two PDFs from the original order sheet, keeping its exact look:

  bassel china_updated.pdf                      the sheet with the not-received rows removed and
                                                the TOTAL line / TARGET TOTAL USD recomputed
  bassel china_missing_items (supplier).pdf     only the not-received rows, supplier columns only
                                                (no USD, markup or selling-price columns)
  bassel china_missing_items (internal).pdf     only the not-received rows, all columns

Rows are copied from the original pages as vector clips, so fonts, photos, colours and grid
lines are identical to "bassel china.pdf". Only the totals are re-typed.

Usage:  python scripts/sheet_updates.py
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "bassel china.pdf"
ITEMS = ROOT / "data" / "items.json"
OUT_UPDATED = ROOT / "bassel china_updated.pdf"
OUT_SUPPLIER = ROOT / "bassel china_missing_items (supplier).pdf"
OUT_INTERNAL = ROOT / "bassel china_missing_items (internal).pdf"

NOT_RECEIVED = [
    "2-21", "2-29", "2-32", "2-33", "2-34", "3-6", "3-17", "3-19", "3-21", "3-22",
    "4-1", "9-14", "11-1", "11-2", "15-3", "15-5", "17-10", "38-3",
]
REPORT_DATE = "6 November 2026"

# figures printed on the original TOTAL line (page 37)
SHEET_TOTAL = {"cartons": 580, "rmb": 296554.00, "cbm": 70.0, "kg": 11791, "usd": 44195.93, "landed": 70000.00}

FONT_BOLD = "C:/Windows/Fonts/arialbd.ttf"
FONT_REG = "C:/Windows/Fonts/arial.ttf"
BLUE = (0, 0, 1)
RED = (0.75, 0.07, 0.07)
GREY = (0.35, 0.35, 0.35)
PAGE_W, PAGE_H = 792, 612
HEADER_TOP, HEADER_BOT = 15.0, 116.9      # title band + column headers
TITLE_BOT = 58.3                          # bottom of the title band
SUPPLIER_X1 = 490.0                       # right edge of the title box (CHINA DOORS / contact)
# Column ranges copied into each missing-items report. The supplier copy shows the supplier's
# own prices in RMB and in USD at the sheet's 6.71 rate (USD PRICE / PC and TOTAL USD), but not
# our markup, landed cost or selling price (+ MARKUP, PROFIT, TOTAL USD + MARKUP).
SUPPLIER_COLS = [(0.0, 541.0), (643.8, 695.2)]   # PHOTO .. USD PRICE / PC, then TOTAL USD
INTERNAL_COLS = [(0.0, PAGE_W)]
BOTTOM_LIMIT = 596.0                      # rows may not go below this


def money(v: float) -> str:
    return f"{v:,.2f}"


# --------------------------------------------------------------------------- analysis
def grid_lines(page: pymupdf.Page) -> list[float]:
    """y positions of the full-width horizontal grid lines (row boundaries)."""
    ys: dict[float, float] = {}
    for d in page.get_drawings():
        for it in d["items"]:
            if it[0] == "l" and abs(it[1].y - it[2].y) < 0.5:
                y = round(it[1].y, 1)
                ys[y] = ys.get(y, 0) + abs(it[2].x - it[1].x)
            elif it[0] == "re" and it[1].height < 1.5:
                y = round(it[1].y0, 1)
                ys[y] = ys.get(y, 0) + it[1].width
    return sorted(y for y, length in ys.items() if length > 700)


def row_bands(doc: pymupdf.Document, refs: set[str]) -> dict[str, tuple[int, float, float]]:
    """sheet ref -> (page index, band top, band bottom) for the requested rows."""
    found: dict[str, tuple[int, float, float]] = {}
    for pno, page in enumerate(doc):
        words = page.get_text("words")
        lines = grid_lines(page)
        for i, w in enumerate(words[:-1]):
            if w[4] == "Bassel" and re.match(r"^\d+-\d+$", words[i + 1][4]):
                ref = words[i + 1][4]
                if ref not in refs:
                    continue
                ay = (w[1] + w[3]) / 2
                top = max(y for y in lines if y < ay)
                bot = min(y for y in lines if y > ay)
                found[ref] = (pno, top, bot)
    missing = refs - set(found)
    if missing:
        raise SystemExit(f"rows not found on the sheet: {sorted(missing)}")
    return found


# --------------------------------------------------------------------------- text patching
def replace_span(page: pymupdf.Page, text: str, new: str, *, near_y: float | None = None,
                 min_x: float = 0, size: float, color=(0, 0, 0), max_width: float | None = None) -> None:
    """Remove the exact span `text` (Arial Bold) and type `new` at the same baseline."""
    for b in page.get_text("dict")["blocks"]:
        for line in b.get("lines", []):
            for s in line["spans"]:
                if s["text"].strip() != text or s["bbox"][0] < min_x:
                    continue
                if near_y is not None and abs(s["bbox"][1] - near_y) > 3:
                    continue
                r = pymupdf.Rect(s["bbox"])
                page.add_redact_annot(r, fill=False)
                page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                                      graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
                if max_width:  # shrink to stay inside the cell
                    font = pymupdf.Font(fontfile=FONT_BOLD)
                    while size > 4 and font.text_length(new, fontsize=size) > max_width:
                        size -= 0.2
                page.insert_text(pymupdf.Point(s["origin"]), new, fontname="arialbd",
                                 fontfile=FONT_BOLD, fontsize=size, color=color)
                return
    raise SystemExit(f"span {text!r} not found on page {page.number + 1}")


def patch_total_line(page: pymupdf.Page, t: dict) -> None:
    replace_span(page, "580 CTNS", f"{t['cartons']} CTNS", size=8.04)
    replace_span(page, "296,554.00", money(t["rmb"]), size=6.0)
    replace_span(page, "70CBM", f"{t['cbm']:.2f}CBM".replace(".00CBM", "CBM"), size=8.04, max_width=29)
    replace_span(page, "11791KG", f"{t['kg']}KG", size=8.04)
    replace_span(page, "44,195.93", money(t["usd"]), size=6.0)
    replace_span(page, "70,000.00", money(t["landed"]), size=6.0)


def scrub(page: pymupdf.Page, rects: list[pymupdf.Rect], *, images: bool = True, graphics: bool = False) -> None:
    """Permanently delete text (and optionally photos / lines) inside `rects`.

    Clipping alone only hides content; the hidden text could still be copied out of the
    file. Everything a reader must not get is removed before the page is reused.
    """
    for r in rects:
        if r.is_empty:
            continue
        page.add_redact_annot(r, fill=False)
    page.apply_redactions(
        images=pymupdf.PDF_REDACT_IMAGE_REMOVE if images else pymupdf.PDF_REDACT_IMAGE_NONE,
        graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED if graphics else pymupdf.PDF_REDACT_LINE_ART_NONE,
    )


def keep_only(doc: pymupdf.Document, bands: dict, *, cols: list[tuple[float, float]], title_only: bool) -> None:
    """In a working copy: delete every data row except the given bands, every column outside `cols`,
    and (title_only) everything right of the title box in the top band (MARKUP / TARGET / RATE)."""
    by_page: dict[int, list[tuple[float, float]]] = {}
    for pno, top, bot in bands.values():
        by_page.setdefault(pno, []).append((top, bot))
    last = len(doc) - 1
    x_max = cols[-1][1]
    gaps, prev = [], 0.0
    for x0, x1 in cols:
        if x0 - prev > 0.5:
            gaps.append((prev + 0.5, x0 - 0.5))
        prev = x1
    if PAGE_W - prev > 0.5:
        gaps.append((prev + 0.5, PAGE_W))
    for pno, page in enumerate(doc):
        rects = [pymupdf.Rect(g0, 0, g1, PAGE_H) for g0, g1 in gaps]
        if title_only:
            rects.append(pymupdf.Rect(SUPPLIER_X1 + 0.5, 0, PAGE_W, TITLE_BOT - 0.5))
        # data area of the page, minus the rows we keep (1 pt inset so neighbour photos are untouched)
        start = HEADER_BOT
        data_end = 116.9 if pno == last else PAGE_H
        for top, bot in sorted(by_page.get(pno, [])):
            rects.append(pymupdf.Rect(0, start + 1, x_max, top - 1))
            start = bot
        rects.append(pymupdf.Rect(0, start + 1, x_max, data_end - 1))
        scrub(page, rects, images=True)


# --------------------------------------------------------------------------- composition
def paste(dst: pymupdf.Page, src: pymupdf.Document, pno: int, clip: pymupdf.Rect, y: float,
          x: float | None = None) -> float:
    """Copy `clip` of src page `pno` onto dst at (x, y), unscaled. Returns new y."""
    if clip.height < 0.05:  # adjacent removed rows leave nothing in between
        return y
    x = clip.x0 if x is None else x
    target = pymupdf.Rect(x, y, x + clip.width, y + clip.height)
    dst.show_pdf_page(target, src, pno, clip=clip)
    return y + clip.height


def build_updated(src: pymupdf.Document, bands: dict) -> pymupdf.Document:
    cut: dict[int, list[tuple[float, float]]] = {}
    for pno, top, bot in bands.values():
        cut.setdefault(pno, []).append((top, bot))
    out = pymupdf.open()
    for pno in range(len(src)):
        if pno not in cut:
            out.insert_pdf(src, from_page=pno, to_page=pno)
            continue
        page = out.new_page(width=PAGE_W, height=PAGE_H)
        y, start = 0.0, 0.0
        for top, bot in sorted(cut[pno]):
            y = paste(page, src, pno, pymupdf.Rect(0, start, PAGE_W, top), y)
            start = bot
        paste(page, src, pno, pymupdf.Rect(0, start, PAGE_W, PAGE_H), y)
    return out


def paste_cols(dst: pymupdf.Page, src: pymupdf.Document, pno: int, top: float, bot: float, y: float,
               cols: list[tuple[float, float]]) -> float:
    """Copy the band [top, bot] of src page `pno`, keeping only `cols`, packed side by side."""
    x = cols[0][0]
    for x0, x1 in cols:
        paste(dst, src, pno, pymupdf.Rect(x0, top, x1, bot), y, x)
        x += x1 - x0
    return y + (bot - top)


def build_missing(src: pymupdf.Document, bands: dict, *, cols: list[tuple[float, float]], summary) -> pymupdf.Document:
    """One copied header per page, then the not-received rows, then the TOTAL line."""
    order = sorted(bands.items(), key=lambda kv: (kv[1][0], kv[1][1]))
    total_top, total_bot = 116.9, 150.6
    out = pymupdf.open()
    page, y = None, 0.0

    def new_page():
        p = out.new_page(width=PAGE_W, height=PAGE_H)
        # title band (CHINA DOORS / contact) is always clipped to the left part so the
        # MARKUP / TARGET boxes of the original never appear here
        paste(p, src, 0, pymupdf.Rect(0, HEADER_TOP, SUPPLIER_X1, TITLE_BOT), HEADER_TOP)
        paste_cols(p, src, 0, TITLE_BOT, HEADER_BOT, TITLE_BOT, cols)
        return p, HEADER_BOT

    for ref, (pno, top, bot) in order:
        if page is None or y + (bot - top) > BOTTOM_LIMIT:
            page, y = new_page()
        # thin red marker in the margin: this row was not received
        page.draw_rect(pymupdf.Rect(12, y + 2, 16, y + (bot - top) - 2), color=None, fill=RED)
        y = paste_cols(page, src, pno, top, bot, y, cols)
    if y + (total_bot - total_top) > BOTTOM_LIMIT:
        page, y = new_page()
    y = paste_cols(page, src, len(src) - 1, total_top, total_bot, y, cols)
    summary(out, page, y)
    return out


def write_lines(page: pymupdf.Page, x: float, y: float, lines: list[tuple[str, float, tuple, str]]) -> float:
    for text, size, color, font in lines:
        if font == "cjk":
            page.insert_text((x, y), text, fontname="china-s", fontsize=size, color=color)
        else:
            page.insert_text((x, y), text, fontname="SumBold" if font == "arialbd" else "SumReg",
                             fontfile=FONT_BOLD if font == "arialbd" else FONT_REG, fontsize=size, color=color)
        y += size * 1.55
    return y


# --------------------------------------------------------------------------- main
def main() -> None:
    rows = {r["ref"]: r for r in json.loads(ITEMS.read_text(encoding="utf-8"))}
    refs = {"Bassel " + r for r in NOT_RECEIVED}
    for r in refs:
        if r not in rows:
            raise SystemExit(f"{r} is not in data/items.json")
    lost = [rows[r] for r in refs]
    m = {
        "items": len(lost),
        "cartons": int(sum(r["cartons"] or 0 for r in lost)),
        "pcs": int(sum(r["total_qty"] or 0 for r in lost)),
        "rmb": round(sum(r["rmb_total"] or 0 for r in lost), 2),
        "cbm": round(sum(r["total_cbm"] or 0 for r in lost), 2),
        "kg": int(round(sum(r["total_weight_kg"] or 0 for r in lost))),
        "usd": round(sum(r["total_cost_usd"] or 0 for r in lost), 2),
        "landed": round(sum(r["total_price_usd"] or 0 for r in lost), 2),
    }
    arrived = {
        "cartons": SHEET_TOTAL["cartons"] - m["cartons"],
        "rmb": round(SHEET_TOTAL["rmb"] - m["rmb"], 2),
        "cbm": round(SHEET_TOTAL["cbm"] - m["cbm"], 2),
        "kg": SHEET_TOTAL["kg"] - m["kg"],
        "usd": round(SHEET_TOTAL["usd"] - m["usd"], 2),
        "landed": round(SHEET_TOTAL["landed"] - m["landed"], 2),
    }
    print("not received:", m)
    print("arrived     :", arrived)

    original = pymupdf.open(SRC)
    bands = row_bands(original, set(NOT_RECEIVED))
    for ref, (pno, top, bot) in sorted(bands.items(), key=lambda kv: kv[1]):
        print(f"  cut {ref:<6} page {pno + 1:>2}  y {top}-{bot}")

    # ---- updated sheet: new TARGET on every page header, new TOTAL line
    a = pymupdf.open(SRC)
    for page in a:
        replace_span(page, "70,000", f"{arrived['landed']:,.0f}", near_y=26.9, min_x=740, size=5.52, color=BLUE,
                     max_width=20)
    patch_total_line(a[-1], arrived)
    # delete the removed rows' text and photos, so they are gone, not just hidden
    for ref, (pno, top, bot) in bands.items():
        scrub(a[pno], [pymupdf.Rect(0, top + 1, PAGE_W, bot - 1)], images=True)
    note_y = 150.6 + 14
    write_lines(a[-1], 21, note_y, [
        (f"Updated {REPORT_DATE}: received goods only. {m['items']} items ({m['cartons']} cartons, {m['pcs']:,} pcs, "
         f"{m['cbm']} CBM, {m['kg']} kg, RMB {money(m['rmb'])}) were not received and have been removed.", 6.5, GREY, "arial"),
        ("TOTAL line = original total minus the removed rows. See \"bassel china_missing_items\".", 6.5, GREY, "arial"),
    ])
    updated = build_updated(a, bands)
    updated.set_metadata({"title": "bassel china - updated (received goods only)", "creator": "China Ordering System"})
    updated.save(OUT_UPDATED, garbage=4, deflate=True)

    # ---- missing items: same rows, TOTAL line with the missing totals.
    # Supplier copy: everything except the 17 rows and the supplier columns is deleted first.
    b = pymupdf.open(SRC)
    patch_total_line(b[-1], m)
    keep_only(b, bands, cols=SUPPLIER_COLS, title_only=True)

    def supplier_summary(doc, last_page, y_end):
        p = doc[0]
        x = 606
        write_lines(p, x, 32, [
            ("ITEMS NOT RECEIVED", 15, RED, "arialbd"),
            ("未收到的货物清单", 12, RED, "cjk"),
        ])
        write_lines(p, x, 82, [
            ("Order: CHINA DOORS / Bassel", 8, (0, 0, 0), "arialbd"),
            (f"Report date: {REPORT_DATE}", 7.5, GREY, "arial"),
            ("", 4, GREY, "arial"),
            ("Ordered (packing sheet total)", 7.5, (0, 0, 0), "arialbd"),
            (f"{SHEET_TOTAL['cartons']} cartons   {SHEET_TOTAL['cbm']:.0f} CBM   {SHEET_TOTAL['kg']:,} kg", 7.5, (0, 0, 0), "arial"),
            ("", 4, GREY, "arial"),
            ("Received", 7.5, (0, 0, 0), "arialbd"),
            (f"{arrived['cartons']} cartons", 7.5, (0, 0, 0), "arial"),
            ("", 4, GREY, "arial"),
            ("NOT RECEIVED", 8.5, RED, "arialbd"),
            ("未收到", 8.5, RED, "cjk"),
            (f"{m['items']} items   {m['cartons']} cartons   {m['pcs']:,} pcs", 8.5, RED, "arialbd"),
            (f"{m['cbm']} CBM   {m['kg']} kg", 8.5, RED, "arialbd"),
            (f"Value at your prices:  RMB {money(m['rmb'])}", 8.5, RED, "arialbd"),
            (f"= USD {money(m['usd'])}  (6.71 RMB per USD)", 8.5, RED, "arialbd"),
            ("金额（人民币及美元）", 8.5, RED, "cjk"),
            ("", 6, GREY, "arial"),
            ("Each row is copied from the order sheet: photo,", 6.5, GREY, "arial"),
            ("item no., description, cartons, quantity, price,", 6.5, GREY, "arial"),
            ("amount, volume, weight, USD price, USD total.", 6.5, GREY, "arial"),
            ("Please replace or refund these items.", 7.5, (0, 0, 0), "arialbd"),
            ("请补发或退款。", 8, (0, 0, 0), "cjk"),
        ])
        for i, page in enumerate(doc):
            page.insert_text((PAGE_W - 70, PAGE_H - 14), f"page {i + 1} / {len(doc)}", fontname="SumReg",
                             fontfile=FONT_REG, fontsize=6.5, color=GREY)

    supplier = build_missing(b, bands, cols=SUPPLIER_COLS, summary=supplier_summary)
    supplier.set_metadata({"title": "Items not received - CHINA DOORS / Bassel", "creator": "China Ordering System"})
    supplier.save(OUT_SUPPLIER, garbage=4, deflate=True)

    b = pymupdf.open(SRC)
    patch_total_line(b[-1], m)
    keep_only(b, bands, cols=INTERNAL_COLS, title_only=False)

    def internal_summary(doc, last_page, y_end):
        write_lines(doc[0], 505, 36, [("ITEMS NOT RECEIVED  (internal: includes our costs and prices)", 9, RED, "arialbd")])
        write_lines(last_page, 21, y_end + 16, [
            (f"Not received: {m['items']} items, {m['cartons']} cartons, {m['pcs']:,} pcs, {m['cbm']} CBM, {m['kg']} kg.", 7.5, RED, "arialbd"),
            (f"Goods value RMB {money(m['rmb'])} = USD {money(m['usd'])}.  Landed cost (incl. shipping share) USD {money(m['landed'])}.", 7.5, RED, "arialbd"),
            (f"Received goods landed cost: USD {money(arrived['landed'])} (was USD 70,000.00 for the full order).", 7.5, (0, 0, 0), "arial"),
            (f"Report date: {REPORT_DATE}.", 6.5, GREY, "arial"),
        ])
        for i, page in enumerate(doc):
            page.insert_text((PAGE_W - 70, PAGE_H - 14), f"page {i + 1} / {len(doc)}", fontname="SumReg",
                             fontfile=FONT_REG, fontsize=6.5, color=GREY)

    internal = build_missing(b, bands, cols=INTERNAL_COLS, summary=internal_summary)
    internal.set_metadata({"title": "Items not received (internal)", "creator": "China Ordering System"})
    internal.save(OUT_INTERNAL, garbage=4, deflate=True)

    for f in (OUT_UPDATED, OUT_SUPPLIER, OUT_INTERNAL):
        d = pymupdf.open(f)
        print(f"wrote {f.name}: {len(d)} pages, {f.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
