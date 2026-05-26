import { useEffect } from "react";
import { Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { getActor, getToken } from "./lib/api";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import PanelLayout from "./pages/PanelLayout";
import Dashboard from "./pages/Dashboard";
import CloudflareAccounts from "./pages/CloudflareAccounts";
import Users from "./pages/Users";
import AuditLogs from "./pages/AuditLogs";
import SettingsPage from "./pages/SettingsPage";
import Domains from "./pages/Domains";
import DomainLayout from "./pages/DomainLayout";
import DomainOverview from "./pages/DomainOverview";
import DomainDNS from "./pages/DomainDNS";
import DomainEmailRouting from "./pages/DomainEmailRouting";
import DomainSettingsPage from "./pages/DomainSettingsPage";
import DomainSecurity from "./pages/DomainSecurity";

function HomeRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    if (getToken() && getActor()) navigate("/dashboard", { replace: true });
    else navigate("/login", { replace: true });
  }, [navigate]);
  return null;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<Login />} />
      <Route path="/admin/login" element={<AdminLogin />} />

      <Route element={<PanelLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/cloudflare-accounts" element={<CloudflareAccounts />} />
        <Route path="/users" element={<Users />} />
        <Route path="/audit-logs" element={<AuditLogs />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/domains" element={<Domains />} />
        <Route path="/domains/:id" element={<DomainLayout />}>
          <Route index element={<DomainOverview />} />
          <Route path="dns" element={<DomainDNS />} />
          <Route path="email-routing" element={<DomainEmailRouting />} />
          <Route path="settings" element={<DomainSettingsPage />} />
          <Route path="security" element={<DomainSecurity />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
