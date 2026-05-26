import { useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../lib/api";
import { useToast } from "../components/Toast";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import CopyButton from "../components/CopyButton";
import {
  IconEdit,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "../components/Icon";
import { formatDate } from "../lib/format";

type CfAccount = { id: number; name: string };
type Domain = { id: number; domain: string; cf_account_id: number };
type Permissions = {
  can_dns: number;
  can_email: number;
  can_domain_settings: number;
  can_full_access: number;
};
type User = {
  id: number;
  cf_account_id: number;
  login_code: string;
  note: string | null;
  expired_at: string | null;
  is_permanent: number;
  created_at: string;
  domain_count: number;
  permissions: Permissions | null;
  status: "active" | "expired";
};

export default function Users() {
  const toast = useToast();
  const [accounts, setAccounts] = useState<CfAccount[]>([]);
  const [users, setUsers] = useState<User[] | null>(null);
  const [q, setQ] = useState("");
  const [accountFilter, setAccountFilter] = useState<number | "">("");
  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  async function load() {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (accountFilter) params.set("cf_account_id", String(accountFilter));
      const [u, a] = await Promise.all([
        api.get<User[]>(`/api/users?${params}`),
        accounts.length === 0
          ? api.get<CfAccount[]>("/api/cf-accounts")
          : Promise.resolve(accounts),
      ]);
      setUsers(u);
      if (accounts.length === 0) setAccounts(a);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Load failed");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, accountFilter]);

  async function onDelete(u: User) {
    if (!confirm(`Delete user ${u.login_code}?`)) return;
    try {
      await api.del(`/api/users/${u.id}`);
      toast.success("User deleted");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    }
  }
  async function onRegen(u: User) {
    if (!confirm(`Regenerate code for ${u.login_code}? The current code will stop working immediately.`)) return;
    try {
      const r = await api.patch<{ login_code: string }>(`/api/users/${u.id}`, {
        regenerate_code: true,
      });
      toast.success(`New code: ${r.login_code}`);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-100">Users</h1>
          <p className="text-sm text-ink-400 mt-1">Manage user access codes and permissions.</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditing(null); setOpenForm(true); }}>
          <IconPlus size={14} /> Add User
        </button>
      </header>

      <div className="card card-pad flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Search</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">
              <IconSearch size={14} />
            </span>
            <input className="input pl-9" placeholder="Code, note, domain..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="min-w-[180px]">
          <label className="label">Cloudflare Account</label>
          <select className="input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value ? Number(e.target.value) : "")}>
            <option value="">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>

      <div className="card overflow-hidden">
        {users === null ? <div className="p-6"><Spinner /></div> :
          users.length === 0 ? <div className="p-8 text-center text-ink-400 text-sm">No users found.</div> :
          <table className="table">
            <thead>
              <tr>
                <th>Code</th><th>Note</th><th>Account</th><th>Domains</th><th>Access</th><th>Expiry</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const acc = accounts.find((a) => a.id === u.cf_account_id);
                const perms = u.permissions;
                const accessLabel = !perms ? "-" :
                  perms.can_full_access ? "Full" :
                  [perms.can_dns ? "DNS" : null, perms.can_email ? "Email" : null, perms.can_domain_settings ? "Settings" : null].filter(Boolean).join(" + ") || "None";
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-ink-100">{u.login_code}</span>
                        <CopyButton value={u.login_code} />
                      </div>
                    </td>
                    <td className="text-ink-300">{u.note ?? "-"}</td>
                    <td className="text-ink-300">{acc?.name ?? `#${u.cf_account_id}`}</td>
                    <td><span className="badge-blue">{u.domain_count}</span></td>
                    <td className="text-ink-200 text-xs">{accessLabel}</td>
                    <td className="text-ink-400 text-xs">{u.is_permanent ? <span className="badge-gray">permanent</span> : formatDate(u.expired_at)}</td>
                    <td>{u.status === "active" ? <span className="badge-green">Active</span> : <span className="badge-red">Expired</span>}</td>
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button className="btn-secondary" onClick={() => { setEditing(u); setOpenForm(true); }}>
                          <IconEdit size={14} />Edit
                        </button>
                        <button className="btn-secondary" onClick={() => onRegen(u)}><IconRefresh size={14} /></button>
                        <button className="btn-danger" onClick={() => onDelete(u)}><IconTrash size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        }
      </div>

      {openForm && (
        <UserForm
          accounts={accounts}
          editing={editing}
          onClose={() => setOpenForm(false)}
          onSaved={() => { setOpenForm(false); load(); }}
        />
      )}
    </div>
  );
}

function UserForm({
  accounts, editing, onClose, onSaved,
}: {
  accounts: CfAccount[];
  editing: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [cfId, setCfId] = useState<number | "">(editing?.cf_account_id ?? accounts[0]?.id ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [permanent, setPermanent] = useState<boolean>(!!editing?.is_permanent);
  const [duration, setDuration] = useState<number | "custom">(editing ? "custom" : 7);
  const [expired, setExpired] = useState<string>(editing?.expired_at ?? "");
  const [prefix, setPrefix] = useState("USER");
  const [pDns, setPDns] = useState<boolean>(!!editing?.permissions?.can_dns);
  const [pEmail, setPEmail] = useState<boolean>(!!editing?.permissions?.can_email);
  const [pSettings, setPSettings] = useState<boolean>(!!editing?.permissions?.can_domain_settings);
  const [pFull, setPFull] = useState<boolean>(!!editing?.permissions?.can_full_access);
  const [allDomains, setAllDomains] = useState<Domain[]>([]);
  const [selectedDomains, setSelectedDomains] = useState<Set<number>>(new Set());
  const [domainSearch, setDomainSearch] = useState("");
  const [loadingDomains, setLoadingDomains] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!cfId) { setAllDomains([]); setSelectedDomains(new Set()); return; }
    setLoadingDomains(true);
    Promise.all([
      api.get<Domain[]>(`/api/domains?cf_account_id=${cfId}`),
      editing ? api.get<{ domains: Domain[] }>(`/api/users/${editing.id}`) : Promise.resolve(null),
    ])
      .then(([all, detail]) => {
        setAllDomains(all);
        if (detail) setSelectedDomains(new Set(detail.domains.map((d) => d.id)));
      })
      .catch((e) => toast.error(e instanceof ApiError ? e.message : "Load domains failed"))
      .finally(() => setLoadingDomains(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfId]);

  const filteredDomains = useMemo(() => {
    const q = domainSearch.trim().toLowerCase();
    if (!q) return allDomains;
    return allDomains.filter((d) => d.domain.toLowerCase().includes(q));
  }, [allDomains, domainSearch]);

  function toggleDomain(id: number) {
    const next = new Set(selectedDomains);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedDomains(next);
  }
  function selectAllVisible() {
    const next = new Set(selectedDomains);
    filteredDomains.forEach((d) => next.add(d.id));
    setSelectedDomains(next);
  }
  function clearAllVisible() {
    const next = new Set(selectedDomains);
    filteredDomains.forEach((d) => next.delete(d.id));
    setSelectedDomains(next);
  }

  async function onSubmit() {
    if (!cfId) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        cf_account_id: cfId,
        note: note || null,
        is_permanent: permanent,
        permissions: {
          can_dns: pFull || pDns,
          can_email: pFull || pEmail,
          can_domain_settings: pFull || pSettings,
          can_full_access: pFull,
        },
        domain_ids: Array.from(selectedDomains),
      };
      if (!permanent) {
        if (duration === "custom") payload.expired_at = expired || null;
        else payload.duration_days = duration;
      }
      if (editing) {
        await api.patch(`/api/users/${editing.id}`, payload);
        toast.success("User updated");
      } else {
        payload.code_prefix = prefix;
        const r = await api.post<{ login_code: string }>("/api/users", payload);
        toast.success(`Code generated: ${r.login_code}`);
      }
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={editing ? `Edit ${editing.login_code}` : "Add User"}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={onSubmit} disabled={submitting || !cfId}>
            {submitting ? "Saving..." : editing ? "Save" : "Create user"}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Cloudflare Account</label>
            <select className="input" value={cfId} disabled={!!editing} onChange={(e) => setCfId(e.target.value ? Number(e.target.value) : "")}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Note</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. shop owner" />
          </div>
        </div>

        <fieldset className="space-y-2">
          <legend className="label">Expiry</legend>
          <div className="flex flex-wrap gap-2">
            <Choice active={permanent} onClick={() => setPermanent(true)}>Permanent</Choice>
            <Choice active={!permanent && duration === 1} onClick={() => { setPermanent(false); setDuration(1); }}>1 day</Choice>
            <Choice active={!permanent && duration === 7} onClick={() => { setPermanent(false); setDuration(7); }}>7 days</Choice>
            <Choice active={!permanent && duration === 30} onClick={() => { setPermanent(false); setDuration(30); }}>30 days</Choice>
            <Choice active={!permanent && duration === "custom"} onClick={() => { setPermanent(false); setDuration("custom"); }}>Custom</Choice>
          </div>
          {!permanent && duration === "custom" && (
            <input
              className="input"
              type="datetime-local"
              value={expired ? expired.replace(" ", "T").slice(0, 16) : ""}
              onChange={(e) => setExpired(e.target.value ? e.target.value.replace("T", " ") + ":00" : "")}
            />
          )}
        </fieldset>

        <fieldset>
          <legend className="label">Permissions</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <PermRow checked={pFull} onChange={(v) => { setPFull(v); if (v) { setPDns(true); setPEmail(true); setPSettings(true); } }}
              title="Full Domain Access"
              desc="Full control: DNS + Email + Settings + Security + Workers Routes + Rules" />
            <PermRow checked={pFull || pDns} disabled={pFull} onChange={setPDns} title="DNS Access" desc="Manage DNS records (add/edit/delete, proxy toggle)" />
            <PermRow checked={pFull || pEmail} disabled={pFull} onChange={setPEmail} title="Email Routing" desc="Manage forwarding rules and catch-all" />
            <PermRow checked={pFull || pSettings} disabled={pFull} onChange={setPSettings} title="Domain Settings" desc="SSL mode, Always HTTPS, cache purge" />
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Assigned Domains</legend>
          <div className="card border-ink-700">
            <div className="p-3 border-b border-ink-800 flex items-center gap-2">
              <span className="text-ink-500"><IconSearch size={14} /></span>
              <input className="bg-transparent flex-1 text-sm placeholder:text-ink-500 focus:outline-none"
                placeholder="Search domain..." value={domainSearch} onChange={(e) => setDomainSearch(e.target.value)} />
              <button type="button" className="text-xs text-ink-300 hover:text-ink-100" onClick={selectAllVisible}>Select all</button>
              <span className="text-ink-700">|</span>
              <button type="button" className="text-xs text-ink-300 hover:text-ink-100" onClick={clearAllVisible}>Clear</button>
            </div>
            <div className="max-h-56 overflow-y-auto divide-y divide-ink-800">
              {loadingDomains ? <div className="p-4"><Spinner /></div> :
                filteredDomains.length === 0 ? <div className="p-4 text-sm text-ink-500">No domains.</div> :
                filteredDomains.map((d) => {
                  const checked = selectedDomains.has(d.id);
                  return (
                    <label key={d.id} className="flex items-center gap-3 px-3 py-2 hover:bg-ink-800 cursor-pointer">
                      <input type="checkbox" className="h-4 w-4 accent-accent-500" checked={checked} onChange={() => toggleDomain(d.id)} />
                      <span className="text-sm text-ink-100">{d.domain}</span>
                    </label>
                  );
                })}
            </div>
            <div className="px-3 py-2 text-xs text-ink-500 border-t border-ink-800">
              {selectedDomains.size} domain(s) selected
            </div>
          </div>
        </fieldset>

        {!editing && (
          <div>
            <label className="label">Code Prefix</label>
            <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="USER, DNS, VIP..." />
            <p className="text-xs text-ink-500 mt-1">The generated code will be {`<PREFIX>-XXXXX`}.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Choice({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm border transition
        ${active ? "bg-accent-500 border-accent-500 text-white" : "bg-ink-900 border-ink-700 text-ink-300 hover:bg-ink-800"}`}>
      {children}
    </button>
  );
}

function PermRow({ checked, onChange, title, desc, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; title: string; desc: string; disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer
        ${checked ? "border-accent-500/40 bg-accent-500/5" : "border-ink-700 bg-ink-900 hover:bg-ink-850"}
        ${disabled ? "opacity-70" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-accent-500" />
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink-100">{title}</div>
        <div className="text-xs text-ink-400 mt-0.5">{desc}</div>
      </div>
    </label>
  );
}
