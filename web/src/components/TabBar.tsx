import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShoppingBag, Boxes, ClipboardList, BarChart3, Settings } from "lucide-react";

const tabs = [
  { to: "/sell", key: "nav.sell", Icon: ShoppingBag },
  { to: "/stock", key: "nav.stock", Icon: Boxes },
  { to: "/history", key: "nav.history", Icon: ClipboardList },
  { to: "/dashboard", key: "nav.dashboard", Icon: BarChart3 },
  { to: "/settings", key: "nav.settings", Icon: Settings },
];

export function TabBar() {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 backdrop-blur safe-bottom">
      <ul className="mx-auto flex max-w-lg justify-around">
        {tabs.map(({ to, key, Icon }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${isActive ? "text-brand" : "text-muted"}`
              }
            >
              <Icon size={24} strokeWidth={2.2} />
              {t(key)}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
