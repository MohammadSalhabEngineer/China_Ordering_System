export function money(n: number | null | undefined, opts: { sign?: boolean } = {}): string {
  const v = Number(n ?? 0);
  const s = `$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (v < 0) return `-${s}`;
  return opts.sign && v > 0 ? `+${s}` : s;
}

export function int(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString("en-US");
}

export function pct(part: number, whole: number): string {
  if (!whole) return "0%";
  return `${Math.round((part / whole) * 100)}%`;
}

const rtf: Record<string, Intl.RelativeTimeFormat> = {};

export function dateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale === "ar" ? "ar-LB-u-nu-latn" : "en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dateOnly(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale === "ar" ? "ar-LB-u-nu-latn" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

export function relative(iso: string, locale: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const f = (rtf[locale] ??= new Intl.RelativeTimeFormat(locale === "ar" ? "ar-u-nu-latn" : "en", { numeric: "auto" }));
  if (diff < 60) return f.format(0, "minute");
  if (diff < 3600) return f.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return f.format(-Math.round(diff / 3600), "hour");
  if (diff < 86400 * 14) return f.format(-Math.round(diff / 86400), "day");
  return dateOnly(iso, locale);
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
