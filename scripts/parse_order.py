"""Parse the China order sheet PDF (`bassel china.pdf`) into structured items + photos.

Outputs (relative to repo root):
  data/items.json        one object per row, see FIELDS below
  data/photos/<ref>.jpg  the photo for each row (ref like "Bassel_2-1")
  data/report.txt        rows without photos, photos without rows, rows needing review

Usage:  python scripts/parse_order.py [path/to/bassel china.pdf]
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent
PDF = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "bassel china.pdf"
OUT = ROOT / "data"
PHOTOS = OUT / "photos"

# Column boundaries (x of left edge, from the header row). A word belongs to the
# column whose range contains its x0.
COLS = [
    ("item_no", 105, 150),
    ("desc", 150, 200),
    ("cartons", 200, 232),
    ("qty_per_carton", 232, 262),
    ("total_qty", 262, 287),
    ("rmb_price", 287, 322),
    ("rmb_total", 322, 362),
    ("cbm", 362, 392),
    ("total_cbm", 392, 430),
    ("weight_kg", 430, 462),
    ("total_weight_kg", 462, 500),
    ("cost_usd", 500, 548),        # "USD PRICE / PC": goods only (white column)
    ("landed_cost_usd", 548, 600), # "+ MARKUP" (blue column): landed cost incl. shipping, totals $70,000
    ("sell_price_usd", 600, 650),  # green column: selling price
    ("total_cost_usd", 650, 700),
    ("total_price_usd", 700, 792),
]
NUMERIC = {c[0] for c in COLS} - {"item_no", "desc"}
ANCHOR = re.compile(r"^(\d+)-(\d+)$")
LOGO_BOX_Y_MAX = 80  # the company logo sits in the top-left corner of every page


def col_of(x: float) -> str | None:
    for name, lo, hi in COLS:
        if lo <= x < hi:
            return name
    return None


def to_num(s: str) -> float | None:
    s = s.replace("￥", "").replace("¥", "").replace(",", "").strip()
    try:
        return float(s)
    except ValueError:
        return None


def parse_page(page: pymupdf.Page, pno: int, rows_out: list, report: list):
    words = page.get_text("words")  # x0, y0, x1, y1, text, block, line, wordno
    # 1. find anchors: "Bassel" followed by "N-M" on the same line
    anchors = []  # (y_center, ref)
    by_line: dict[tuple, list] = {}
    for w in words:
        by_line.setdefault((w[5], w[6]), []).append(w)
    for ws in by_line.values():
        ws.sort(key=lambda w: w[0])
        for i, w in enumerate(ws[:-1]):
            if w[4] == "Bassel" and ANCHOR.match(ws[i + 1][4]):
                yc = (w[1] + w[3]) / 2
                anchors.append((yc, f"Bassel {ws[i+1][4]}"))
    anchors.sort()

    # 2. also detect numeric rows that have no anchor (merged cells on the sheet):
    #    a row is a cluster of words in the cartons..total_price columns.
    #    Only words in the total_qty column count (sub-line prices under "+MARKUP"
    #    must not create ghost rows), and the sheet's final "TOTAL:" line is skipped.
    total_line_ys = {round((w[1] + w[3]) / 2) for w in words if w[4].upper().startswith("TOTAL:")}
    numeric_ys = sorted({round((w[1] + w[3]) / 2) for w in words if col_of(w[0]) == "total_qty" and w[1] > 80})
    clusters: list[list[int]] = []
    for y in numeric_ys:
        if clusters and y - clusters[-1][-1] <= 6:
            clusters[-1].append(y)
        else:
            clusters.append([y])
    for cl in clusters:
        yc = sum(cl) / len(cl)
        if any(abs(yc - ty) <= 8 for ty in total_line_ys):
            continue
        if not any(abs(yc - ay) <= 8 for ay, _ in anchors):
            anchors.append((yc, f"Sheet p{pno}-y{int(yc)}"))
    anchors.sort()
    # name anchor-less rows after the previous "Bassel N-M" row with a letter suffix
    prev_ref, suffix = None, 0
    for i, (yc, ref) in enumerate(anchors):
        if ref.startswith("Sheet "):
            suffix += 1
            base = prev_ref or f"Bassel p{pno}-0"
            anchors[i] = (yc, f"{base}{'bcdefgh'[suffix - 1]}")
        else:
            prev_ref, suffix = ref, 0
    if not anchors:
        return

    # 3. row bands: midpoints between consecutive anchors
    bands = []
    for i, (yc, ref) in enumerate(anchors):
        top = 80 if i == 0 else (anchors[i - 1][0] + yc) / 2
        bot = page.rect.height if i == len(anchors) - 1 else (yc + anchors[i + 1][0]) / 2
        bands.append((top, bot, yc, ref))

    # 4. assign words to rows/columns
    rows = {ref: {"ref": ref, "page": pno, "item_no": [], "desc": []} for _, _, _, ref in bands}
    for w in words:
        if w[1] < 80 or w[4] in ("Bassel",) or ANCHOR.match(w[4]):
            continue
        c = col_of(w[0])
        if c is None:
            continue
        yc = (w[1] + w[3]) / 2
        if any(abs(yc - ty) <= 8 for ty in total_line_ys):
            continue
        for top, bot, _, ref in bands:
            if top <= yc < bot:
                row = rows[ref]
                if c in ("item_no", "desc"):
                    row[c].append((w[1], w[0], w[4]))
                else:
                    # numeric columns: keep the value nearest the anchor line
                    v = to_num(w[4])
                    if v is None:
                        continue
                    ay = next(a for t, b, a, r in bands if r == ref)
                    prev = row.get(c)
                    if prev is None or abs(yc - ay) < abs(prev[1] - ay):
                        row[c] = (v, yc)
                break

    # 5. photos: image whose centre falls in a band
    imgs = []
    for info in page.get_image_info(xrefs=True):
        x0, y0, x1, y1 = info["bbox"]
        if y1 < LOGO_BOX_Y_MAX or x0 > 105:
            continue
        imgs.append((info["xref"], (y0 + y1) / 2, info["bbox"]))
    photo_of: dict[str, int] = {}
    # Pass 1: an image whose vertical extent covers a row's anchor line belongs to
    # that row. One image may cover two rows (e.g. spoon/fork pairs share a photo).
    unassigned = []
    for xref, yc, bbox in imgs:
        y0, y1 = bbox[1], bbox[3]
        hits = [ref for _, _, ay, ref in bands if y0 - 4 <= ay <= y1 + 4]
        if not hits:
            unassigned.append((xref, yc, bbox))
            continue
        for ref in hits:
            if ref in photo_of and photo_of[ref] != xref:
                report.append(f"page {pno}: row {ref} has 2 images (xref {photo_of[ref]} and {xref}); keeping first")
            else:
                photo_of[ref] = xref
    # Pass 2: leftovers go to the band with the largest vertical overlap that has
    # no photo yet, else to the band containing the image centre.
    for xref, yc, bbox in unassigned:
        y0, y1 = bbox[1], bbox[3]
        best, best_ov = None, 0.0
        for top, bot, _, ref in bands:
            ov = max(0.0, min(bot, y1) - max(top, y0))
            if ov > best_ov and ref not in photo_of:
                best, best_ov = ref, ov
        if best is None:
            for top, bot, _, ref in bands:
                if top <= yc < bot:
                    best = ref
                    break
        if best is None:
            report.append(f"page {pno}: image xref {xref} at y={yc:.0f} matches no row")
        elif best in photo_of:
            report.append(f"page {pno}: row {best} has 2 images (xref {photo_of[best]} and {xref}); keeping first")
        else:
            photo_of[best] = xref

    for _, _, _, ref in bands:
        row = rows[ref]
        item_no = " ".join(t for _, _, t in sorted(row["item_no"]))
        desc = " ".join(t for _, _, t in sorted(row["desc"]))
        out = {
            "ref": ref,
            "page": pno,
            "item_no": item_no,
            "desc_zh": desc,
        }
        for c in NUMERIC:
            out[c] = row[c][0] if c in row else None
        # the sheet leaves a few unit cells blank; derive them from the row totals
        q = out["total_qty"]
        if q:
            if out["cost_usd"] is None and out["total_cost_usd"] is not None:
                out["cost_usd"] = round(out["total_cost_usd"] / q, 2)
                report.append(f"page {pno}: row {ref} unit cost derived from total")
            if out["landed_cost_usd"] is None and out["total_price_usd"] is not None:
                out["landed_cost_usd"] = round(out["total_price_usd"] / q, 2)
                report.append(f"page {pno}: row {ref} landed cost derived from total")
            if out["sell_price_usd"] is None and out["landed_cost_usd"] is not None:
                out["sell_price_usd"] = round(out["landed_cost_usd"] * 2, 2)
                report.append(f"page {pno}: row {ref} sell price derived as 2x landed cost")
        if re.search(r"\d[b-h]$", ref):
            out["needs_review"] = "row had no 'Bassel N-M' number on the sheet; named after the row above"
            report.append(f"page {pno}: row {ref} named after previous row (no sheet ref)")
        xref = photo_of.get(ref)
        out["_xref"] = xref  # saved to disk in main() once refs are unique
        out["photo"] = None
        if xref is None:
            report.append(f"page {pno}: row {ref} has no photo")
        if out["total_qty"] is None:
            out["needs_review"] = "no quantity on sheet (variant sharing a merged cell?)"
            report.append(f"page {pno}: row {ref} has no quantity/price numbers")
        rows_out.append(out)


def main():
    OUT.mkdir(exist_ok=True)
    PHOTOS.mkdir(exist_ok=True)
    doc = pymupdf.open(PDF)
    rows: list[dict] = []
    report: list[str] = []
    for pno, page in enumerate(doc, start=1):
        parse_page(page, pno, rows, report)

    # the sheet reuses a few refs (e.g. "Bassel 12-1" appears twice); make them unique
    seen: dict[str, int] = {}
    for r in rows:
        n = seen.get(r["ref"], 0) + 1
        seen[r["ref"]] = n
        if n > 1:
            report.append(f"page {r['page']}: duplicate ref {r['ref']} renamed to {r['ref']} ({n})")
            r["ref"] = f"{r['ref']} ({n})"
            r["needs_review"] = "sheet reused this ref number"

    # save photos now that refs are unique
    for r in rows:
        xref = r.pop("_xref")
        if xref is None:
            continue
        fname = re.sub(r"[^A-Za-z0-9._-]+", "_", r["ref"]).strip("_") + ".jpg"
        pix = pymupdf.Pixmap(doc, xref)
        if pix.n - pix.alpha >= 4:  # CMYK -> RGB
            pix = pymupdf.Pixmap(pymupdf.csRGB, pix)
        if pix.alpha:
            pix = pymupdf.Pixmap(pix, 0)  # drop alpha for JPEG
        pix.save(PHOTOS / fname, jpg_quality=88)
        r["photo"] = fname

    # sanity totals vs the sheet's TOTAL line
    tc = sum(r["cartons"] or 0 for r in rows)
    tq = sum(r["total_qty"] or 0 for r in rows)
    tcost = sum(r["total_cost_usd"] or 0 for r in rows)
    tprice = sum(r["total_price_usd"] or 0 for r in rows)  # sheet's "TOTAL USD + MARKUP" = landed total
    tsell = sum((r["sell_price_usd"] or 0) * (r["total_qty"] or 0) for r in rows)
    trmb = sum(r["rmb_total"] or 0 for r in rows)
    summary = (
        f"rows={len(rows)} with_photo={sum(1 for r in rows if r['photo'])} "
        f"cartons={tc} total_qty={tq} rmb_total={trmb:,.2f} "
        f"goods_cost_usd={tcost:,.2f} landed_cost_usd={tprice:,.2f} sell_value_usd={tsell:,.2f}"
    )
    print(summary)
    (OUT / "items.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "report.txt").write_text(summary + "\n\n" + "\n".join(report), encoding="utf-8")
    print(f"{len(report)} notes written to data/report.txt")


if __name__ == "__main__":
    main()
