import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";

export function Header({ title, back, right, children }: { title: string; back?: boolean; right?: ReactNode; children?: ReactNode }) {
  const nav = useNavigate();
  const { t } = useTranslation();
  return (
    <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur border-b border-line">
      <div className="flex items-center gap-2 px-3 py-2 min-h-14">
        {back && (
          <button className="rounded-full p-2 -ms-1 text-brand active:bg-line" onClick={() => nav(-1)} aria-label={t("common.back")}>
            <ChevronLeft size={26} className="rtl:rotate-180" />
          </button>
        )}
        <h1 className="text-xl font-bold grow truncate">{title}</h1>
        {right}
      </div>
      {children && <div className="px-3 pb-2">{children}</div>}
    </header>
  );
}
