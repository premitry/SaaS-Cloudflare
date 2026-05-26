import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import Spinner from "../components/Spinner";
import { useToast } from "../components/Toast";
import { IconSearch } from "../components/Icon";

type Audit = {
  id: number;
  cf_account_id: number | null;
  user_id: number | null;
  actor_type: string;
  action: string;
  target: string | null;
  ip_address: string | null;
  created_at: string;
  user_code: string | null;
  cf_account_name: string | null;
};

export default function AuditLogs() {
  const toast = useToast();
  const [list, setList] = useState<Audit[] | null>(null);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("");

  async function load() {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (action) params.set("action", action);
      params.set("limit", "200");
      setList(await api.get<Audit[]>(`/api/audit-logs?${params}`));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, action]);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <header>
        <h1 className="text-xl font-semibold text-ink-100">Audit Logs</h1>
        <p className="text-sm text-ink-400 mt-1">
          Every mutation is recorded with the actor, target, and IP address.
        </p>
      </header>

      <div className="card card-pad flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Search</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">
              <IconSearch size={14} />
            </span>
            <input className="input pl-9" placeholder="Target, IP..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="min-w-[180px]">
          <label className="label">Action</label>
          <input className="input" placeholder="dns.create, email.*..." value={action} onChange={(e) => setAction(e.target.value)} />
        </div>
      </div>

      <div className="card overflow-hidden">
        {list === null ? (
          <div className="p-6"><Spinner /></div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-ink-400 text-sm">No events.</div>
        ) : (
          <table className="table">
            <thead>
              <tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Account</th><th>IP</th></tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-ink-400">{a.created_at}</td>
                  <td>
                    {a.actor_type === "admin" ? <span className="badge-blue">admin</span> :
                      a.user_code ? <span className="font-mono text-ink-200 text-xs">{a.user_code}</span> :
                      <span className="text-ink-500 text-xs">{a.actor_type}</span>}
                  </td>
                  <td className="font-mono text-xs text-ink-100">{a.action}</td>
                  <td className="text-ink-300 text-xs">{a.target ?? "-"}</td>
                  <td className="text-ink-400 text-xs">{a.cf_account_name ?? "-"}</td>
                  <td className="text-ink-400 text-xs font-mono">{a.ip_address ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
