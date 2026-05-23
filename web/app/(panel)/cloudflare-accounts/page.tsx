"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import Modal from "../../../components/Modal";
import Spinner from "../../../components/Spinner";
import { IconPlus, IconRefresh, IconTrash } from "../../../components/Icon";
import { formatDate } from "../../../lib/format";

type CfAccount = {
  id: number;
  name: string;
  email: string | null;
  account_id: string | null;
  domain_count: number;
  created_at: string;
};

export default function CfAccountsPage() {
  const toast = useToast();
  const [list, setList] = useState<CfAccount[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  // form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    try {
      setList(await api.get<CfAccount[]>("/api/cf-accounts"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function onCreate() {
    setSubmitting(true);
    try {
      await api.post("/api/cf-accounts", {
        name,
        email: email || undefined,
        api_token: token,
      });
      toast.success("Cloudflare account connected");
      setOpen(false);
      setName("");
      setEmail("");
      setToken("");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function onSync(id: number) {
    setBusy(id);
    try {
      const r = await api.post<{ added: number; updated: number; total: number }>(
        `/api/cf-accounts/${id}/sync`
      );
      toast.success(`Synced ${r.total} zones (+${r.added}, ~${r.updated})`);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Sync failed");
    } finally {
      setBusy(null);
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this Cloudflare account? All synced domains and assignments will be removed.")) return;
    setBusy(id);
    try {
      await api.del(`/api/cf-accounts/${id}`);
      toast.success("Deleted");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-100">Cloudflare Accounts</h1>
          <p className="text-sm text-ink-400 mt-1">
            Connect Cloudflare accounts via scoped API tokens. Domains stay in your account.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setOpen(true)}>
          <IconPlus size={14} /> Connect Account
        </button>
      </header>

      <div className="card overflow-hidden">
        {list === null ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-ink-400 text-sm">
            No Cloudflare accounts connected yet.
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Account ID</th>
                <th>Domains</th>
                <th>Connected</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium text-ink-100">{a.name}</td>
                  <td className="text-ink-300">{a.email ?? "-"}</td>
                  <td className="font-mono text-xs text-ink-400">
                    {a.account_id ?? "-"}
                  </td>
                  <td>
                    <span className="badge-blue">{a.domain_count}</span>
                  </td>
                  <td className="text-ink-400">{formatDate(a.created_at)}</td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        className="btn-secondary"
                        onClick={() => onSync(a.id)}
                        disabled={busy === a.id}
                      >
                        <IconRefresh size={14} />
                        Sync
                      </button>
                      <button
                        className="btn-danger"
                        onClick={() => onDelete(a.id)}
                        disabled={busy === a.id}
                      >
                        <IconTrash size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Connect Cloudflare Account"
        footer={
          <>
            <button className="btn-secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={onCreate}
              disabled={submitting || !name || !token}
            >
              {submitting ? "Connecting..." : "Connect"}
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company A"
            />
          </div>
          <div>
            <label className="label">Email (optional)</label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ops@company.com"
            />
          </div>
          <div>
            <label className="label">API Token</label>
            <input
              type="password"
              className="input font-mono"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Cloudflare scoped API token"
            />
            <p className="text-xs text-ink-500 mt-1.5 leading-relaxed">
              Required scopes: Zone Read, DNS Edit, Email Routing Rules &amp;
              Addresses, Zone Settings Edit, Cache Purge.
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
