import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, getActor, type StoredActor } from "../lib/api";
import Spinner from "../components/Spinner";
import {
  IconCloud,
  IconGlobe,
  IconList,
  IconUsers,
} from "../components/Icon";

type CfAccount = { id: number; name: string; domain_count: number };
type Domain = {
  id: number;
  domain: string;
  cf_account_id: number;
  status?: string;
};
type User = { id: number; login_code: string };
type Audit = {
  id: number;
  action: string;
  target: string | null;
  ip_address: string | null;
  created_at: string;
  user_code: string | null;
  cf_account_name: string | null;
  actor_type: string;
};

export default function Dashboard() {
  const [actor, setActor] = useState<StoredActor | null>(null);
  const [accounts, setAccounts] = useState<CfAccount[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const a = getActor();
    setActor(a);
    (async () => {
      try {
        const ds = await api.get<Domain[]>("/api/domains");
        setDomains(ds);
        if (a?.type === "admin") {
          const [as, us, al] = await Promise.all([
            api.get<CfAccount[]>("/api/cf-accounts"),
            api.get<User[]>("/api/users"),
            api.get<Audit[]>("/api/audit-logs?limit=10"),
          ]);
          setAccounts(as);
          setUsers(us);
          setAudits(al);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      <header>
        <h1 className="text-xl font-semibold text-ink-100">Dashboard</h1>
        <p className="text-sm text-ink-400 mt-1">
          {actor?.type === "admin"
            ? `Welcome back, ${actor.username}.`
            : actor?.type === "user"
            ? `Logged in as ${actor.login_code}.`
            : ""}
        </p>
      </header>

      {loading ? (
        <Spinner />
      ) : (
        <>
          {actor?.type === "admin" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Cloudflare Accounts" value={accounts.length} to="/cloudflare-accounts" icon={IconCloud} />
              <StatCard label="Domains" value={domains.length} to="/domains" icon={IconGlobe} />
              <StatCard label="Users" value={users.length} to="/users" icon={IconUsers} />
              <StatCard label="Audit Events" value={audits.length} to="/audit-logs" icon={IconList} />
            </div>
          )}

          <section className="card">
            <header className="flex items-center justify-between px-5 py-3 border-b border-ink-700">
              <h2 className="font-semibold text-ink-100">Your Domains</h2>
              <Link to="/domains" className="text-sm text-accent-300 hover:text-accent-200">
                View all
              </Link>
            </header>
            {domains.length === 0 ? (
              <p className="px-5 py-8 text-sm text-ink-400">
                No domains yet.{" "}
                {actor?.type === "admin"
                  ? "Connect a Cloudflare account to sync zones."
                  : "Ask your admin to assign domains to your code."}
              </p>
            ) : (
              <ul className="divide-y divide-ink-800">
                {domains.slice(0, 8).map((d) => (
                  <li key={d.id} className="flex items-center justify-between px-5 py-3">
                    <Link to={`/domains/${d.id}`} className="text-ink-100 hover:text-accent-300">
                      {d.domain}
                    </Link>
                    {d.status ? (
                      <span className={d.status === "active" ? "badge-green" : "badge-amber"}>
                        {d.status}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {actor?.type === "admin" && audits.length > 0 && (
            <section className="card">
              <header className="flex items-center justify-between px-5 py-3 border-b border-ink-700">
                <h2 className="font-semibold text-ink-100">Recent Activity</h2>
                <Link to="/audit-logs" className="text-sm text-accent-300 hover:text-accent-200">
                  View all
                </Link>
              </header>
              <ul className="divide-y divide-ink-800">
                {audits.slice(0, 6).map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-ink-100 font-mono">{a.action}</div>
                      <div className="text-ink-400 truncate">
                        {a.target ?? "-"} - {a.user_code ?? a.actor_type}
                        {a.ip_address ? ` - ${a.ip_address}` : ""}
                      </div>
                    </div>
                    <span className="text-ink-500 text-xs whitespace-nowrap">{a.created_at}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  to,
  icon: Icon,
}: {
  label: string;
  value: number;
  to: string;
  icon: (p: { size?: number }) => JSX.Element;
}) {
  return (
    <Link to={to} className="card card-pad hover:border-ink-600 transition block">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-ink-400">{label}</span>
        <Icon size={16} />
      </div>
      <div className="text-2xl font-semibold text-ink-100 mt-2">{value}</div>
    </Link>
  );
}
