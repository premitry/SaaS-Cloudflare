import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearAuth, getActor, type StoredActor } from "../lib/api";
import {
  IconCloud,
  IconCog,
  IconGlobe,
  IconHome,
  IconList,
  IconLogout,
  IconUsers,
} from "./Icon";

type Item = {
  to: string;
  label: string;
  icon: (props: { size?: number }) => JSX.Element;
  adminOnly?: boolean;
};

const items: Item[] = [
  { to: "/dashboard", label: "Dashboard", icon: IconHome },
  {
    to: "/cloudflare-accounts",
    label: "Cloudflare Accounts",
    icon: IconCloud,
    adminOnly: true,
  },
  { to: "/domains", label: "Domains", icon: IconGlobe },
  { to: "/users", label: "Users", icon: IconUsers, adminOnly: true },
  { to: "/audit-logs", label: "Audit Logs", icon: IconList, adminOnly: true },
  { to: "/settings", label: "Settings", icon: IconCog },
];

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [actor, setActor] = useState<StoredActor | null>(null);

  useEffect(() => {
    setActor(getActor());
  }, []);

  function logout() {
    clearAuth();
    navigate(actor?.type === "admin" ? "/admin/login" : "/login");
  }

  const visible = items.filter((i) => !i.adminOnly || actor?.type === "admin");

  return (
    <aside className="hidden md:flex md:w-60 lg:w-64 flex-col border-r border-ink-800 bg-ink-950">
      <div className="px-5 py-5 border-b border-ink-800">
        <Link to="/dashboard" className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-gradient-to-br from-accent-400 to-accent-700 flex items-center justify-center">
            <IconCloud size={16} />
          </div>
          <span className="font-semibold text-ink-100">CF Panel</span>
        </Link>
      </div>
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {visible.map((it) => {
          const active =
            location.pathname === it.to ||
            location.pathname.startsWith(it.to + "/");
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition
                ${
                  active
                    ? "bg-ink-800 text-ink-100"
                    : "text-ink-300 hover:bg-ink-900 hover:text-ink-100"
                }`}
            >
              <it.icon size={16} />
              <span>{it.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-ink-800 p-3 space-y-2">
        <div className="rounded-lg bg-ink-900 border border-ink-800 px-3 py-2 text-xs">
          <div className="text-ink-400">Signed in as</div>
          <div className="font-medium text-ink-100 truncate">
            {actor?.type === "admin"
              ? `Admin: ${actor.username}`
              : actor?.type === "user"
              ? `User: ${actor.login_code}`
              : "..."}
          </div>
        </div>
        <button
          type="button"
          onClick={logout}
          className="btn-ghost w-full justify-start"
        >
          <IconLogout size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
