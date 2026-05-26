import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { IconGlobe } from "../components/Icon";

type DomInfo = {
  id: number;
  domain: string;
  zone_id: string;
  perms: {
    can_dns: boolean;
    can_email: boolean;
    can_domain_settings: boolean;
    can_full_access: boolean;
  };
};

export default function DomainLayout() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const location = useLocation();
  const [info, setInfo] = useState<DomInfo | null>(null);

  useEffect(() => {
    api
      .get<DomInfo>(`/api/domains/${id}`)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [id]);

  const base = `/domains/${id}`;
  const tabs = [
    { to: base, label: "Overview", show: true },
    { to: `${base}/dns`, label: "DNS", show: info?.perms.can_dns ?? true },
    { to: `${base}/email-routing`, label: "Email Routing", show: info?.perms.can_email ?? true },
    { to: `${base}/settings`, label: "Domain Settings", show: info?.perms.can_domain_settings ?? true },
    { to: `${base}/security`, label: "Security", show: info?.perms.can_full_access ?? false },
  ];

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <header className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center">
          <IconGlobe size={16} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ink-100">{info?.domain ?? "Loading..."}</h1>
          {info?.zone_id ? <div className="text-xs text-ink-500 font-mono">{info.zone_id}</div> : null}
        </div>
      </header>

      <div className="border-b border-ink-700">
        <div className="flex gap-1 -mb-px overflow-x-auto">
          {tabs.filter((t) => t.show).map((t) => {
            const active = location.pathname === t.to;
            return (
              <Link key={t.to} to={t.to} className={`tab-link ${active ? "tab-link-active" : ""}`}>
                {t.label}
              </Link>
            );
          })}
        </div>
      </div>

      <div><Outlet /></div>
    </div>
  );
}
