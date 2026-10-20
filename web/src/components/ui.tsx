import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { X, ImageOff, Loader2 } from "lucide-react";
import { photoUrl, explainError } from "../lib/supabase";

export function Spinner({ className = "" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-brand ${className}`} size={28} aria-hidden />;
}

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <Spinner />
      <span className="text-sm">{label ?? t("common.loading")}</span>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  const { key, args } = explainError(error);
  return (
    <div className="card m-4 p-4 border-bad/30 bg-red-50 text-bad">
      <p className="text-sm">{t(key, args)}</p>
      {onRetry && (
        <button className="btn-secondary mt-3 w-full" onClick={onRetry}>
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-16 text-center text-muted text-sm px-6">{children}</div>;
}

/** Bottom sheet / modal used for forms. Closes on backdrop tap. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  tall,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  tall?: boolean;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} role="dialog" aria-modal>
      <div
        className={`relative w-full max-w-lg rounded-t-3xl bg-paper shadow-2xl ${tall ? "h-[92dvh]" : "max-h-[92dvh]"} flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-line absolute left-1/2 -translate-x-1/2 top-2" />
          <h2 className="text-lg font-bold mt-2">{title}</h2>
          <button className="rounded-full p-2 text-muted hover:bg-line mt-2" onClick={onClose} aria-label={t("common.close")}>
            <X size={22} />
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-4 safe-bottom grow">{children}</div>
      </div>
    </div>
  );
}

export function Photo({ path, alt, className = "" }: { path: string | null | undefined; alt: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  const src = photoUrl(path);
  if (!src || broken) {
    return (
      <div className={`flex items-center justify-center bg-line/60 text-muted ${className}`} aria-label={alt}>
        <ImageOff size={28} />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" className={`object-cover bg-line/40 ${className}`} onError={() => setBroken(true)} />;
}

export function StockBadge({ stock, initial }: { stock: number; initial: number }) {
  const { t } = useTranslation();
  if (stock <= 0) return <span className="badge bg-bad text-white">{t("sell.outOfStock")}</span>;
  const low = initial > 0 && stock <= Math.max(2, Math.ceil(initial * 0.2));
  return (
    <span className={`badge ${low ? "bg-amber-100 text-warn" : "bg-brand-soft text-brand-dark"}`}>
      {stock}
      {low ? ` · ${t("sell.lowStock")}` : ""}
    </span>
  );
}

export function PaymentBadge({ status }: { status: "paid" | "partial" | "unpaid" }) {
  const { t } = useTranslation();
  const cls = status === "paid" ? "bg-green-100 text-ok" : status === "partial" ? "bg-amber-100 text-warn" : "bg-red-100 text-bad";
  return <span className={`badge ${cls}`}>{t(`payment.${status}`)}</span>;
}

export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 2600);
    return () => clearTimeout(id);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
      <div className="rounded-2xl bg-ink text-white px-4 py-3 text-sm shadow-lg max-w-md">{message}</div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block mb-4">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="block mt-1 text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function PinInput({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <input
      className="input text-center text-2xl tracking-[0.6em] font-mono"
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="current-password"
      maxLength={6}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
    />
  );
}

export function Stepper({ value, min = 1, max, onChange }: { value: number; min?: number; max?: number; onChange: (v: number) => void }) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1);
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-white overflow-hidden" dir="ltr">
      <button type="button" className="px-4 py-2 text-xl font-bold text-brand active:bg-line" onClick={dec} aria-label="-">
        −
      </button>
      <input
        className="w-14 text-center text-lg font-semibold outline-none py-2"
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = parseInt(e.target.value || "0", 10);
          if (Number.isNaN(n)) return;
          onChange(max !== undefined ? Math.min(max, Math.max(min, n)) : Math.max(min, n));
        }}
      />
      <button type="button" className="px-4 py-2 text-xl font-bold text-brand active:bg-line" onClick={inc} aria-label="+">
        +
      </button>
    </div>
  );
}
