import { HashRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AuthProvider, useAuth } from "./lib/auth";
import { supabaseConfigured } from "./lib/supabase";
import { Loading } from "./components/ui";
import { TabBar } from "./components/TabBar";
import LoginPage from "./pages/Login";
import DeviceNamePage from "./pages/DeviceName";
import SellPage from "./pages/Sell";
import StockPage from "./pages/Stock";
import ItemPage from "./pages/Item";
import HistoryPage from "./pages/History";
import SalePage from "./pages/Sale";
import DashboardPage from "./pages/Dashboard";
import SettingsPage from "./pages/Settings";

function Protected() {
  const { loading, session, profile, deviceNickname } = useAuth();
  if (loading) return <Loading />;
  if (!session || !profile) return <Navigate to="/login" replace />;
  if (!profile.active) return <Navigate to="/login?inactive=1" replace />;
  if (!deviceNickname) return <Navigate to="/device" replace />;
  return (
    <div className="min-h-dvh pb-24 max-w-lg mx-auto">
      <Outlet />
      <TabBar />
    </div>
  );
}

function NotConfigured() {
  const { t } = useTranslation();
  return <div className="m-6 card p-6 text-center text-muted">{t("common.notConfigured")}</div>;
}

export default function App() {
  if (!supabaseConfigured) return <NotConfigured />;
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/device" element={<DeviceNamePage />} />
          <Route element={<Protected />}>
            <Route path="/" element={<Navigate to="/sell" replace />} />
            <Route path="/sell" element={<SellPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/stock/:id" element={<ItemPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/history/:id" element={<SalePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
