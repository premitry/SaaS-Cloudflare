import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { getActor, getToken } from "../lib/api";

export default function PanelLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken() || !getActor()) {
      navigate("/login", { replace: true });
      return;
    }
    setReady(true);
  }, [navigate]);
  if (!ready) return null;
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
