import { useEffect, useState } from "react";
import { ApiError, api } from "../lib/api";
import { useToast } from "../components/Toast";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import { IconPlus, IconRefresh, IconShield, IconTrash } from "../components/Icon";
import { formatDate } from "../lib/format";

type CfAccount = {
  id: number;
  name: string;
  email: string | null;
  api_type: "token" | "global";
  account_id: string | null;
  domain_count: number;
  created_at: string;
};

type AuthType = "token" | "global";

export default function CloudflareAccounts() {
  const toast = useToast();
  const [list, setList] = useState<CfAccount[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);

  // form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [authType, setAuthType] = useState<AuthType>("token");
  const [credential, setCredential] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function resetForm() {
    setName("");
    setEmail("");
    setAuthType("token");
    setCredential("");
  }

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
      const payload: Record<string, unknown> = {
        name,
        api_type: authType,
        api_token: credential,
      };
      if (authType === "global") {
        if (!email) {
          toast.error("Email is required for Global API Key auth");
          setSubmitting(false);
          return;
        }
        payload.email = email;
      } else if (email) {
        payload.email = email; // optional reference for token mode
      }
      await api.post("/api/cf-accounts", payload);
      toast.success("Cloudflare account connected");
      setOpen(false);
      resetForm();
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
    if (
      !confirm(
        "Delete this Cloudflare account? All synced domains and assignments will be removed."
      )
    )
      return;
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

  const credentialReady = !!credential && (authType === "token" || !!email);

  return (
    <div className="p-6 space-y-5 max-w-6xl">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink-100">Cloudflare Accounts</h1>
          <p className="text-sm text-ink-400 mt-1">
            Connect Cloudflare accounts via scoped API token or Global API Key.
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
                <th>Auth</th>
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
                  <td>
                    {a.api_type === "global" ? (
                      <span className="badge-amber">Global Key</span>
                    ) : (
                      <span className="badge-blue">API Token</span>
                    )}
                  </td>
                  <td className="text-ink-300 text-xs">{a.email ?? "-"}</td>
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
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        title="Connect Cloudflare Account"
        footer={
          <>
            <button
              className="btn-secondary"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
            >
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={onCreate}
              disabled={submitting || !name || !credentialReady}
            >
              {submitting ? "Connecting..." : "Connect"}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Company A"
            />
          </div>

          {/* Auth type toggle */}
          <fieldset>
            <legend className="label">Authentication Type</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <AuthChoice
                active={authType === "token"}
                onClick={() => setAuthType("token")}
                title="API Token"
                desc="Recommended. Scoped per zone/account permissions."
              />
              <AuthChoice
                active={authType === "global"}
                onClick={() => setAuthType("global")}
                title="Global API Key"
                desc="Full account access. Requires your Cloudflare email."
              />
            </div>
          </fieldset>

          {/* Email field */}
          <div>
            <label className="label">
              Email{" "}
              {authType === "global" ? (
                <span className="text-red-400">*</span>
              ) : (
                <span className="text-ink-500">(optional)</span>
              )}
            </label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={
                authType === "global"
                  ? "your-cloudflare-account@example.com"
                  : "ops@company.com"
              }
              type="email"
            />
            {authType === "global" && (
              <p className="text-xs text-ink-500 mt-1">
                Your Cloudflare login email. Used together with the Global API
                Key to authenticate every request.
              </p>
            )}
          </div>

          {/* Credential field */}
          <div>
            <label className="label">
              {authType === "global" ? "Global API Key" : "API Token"}
            </label>
            <input
              type="password"
              className="input font-mono"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder={
                authType === "global"
                  ? "Cloudflare Global API Key"
                  : "Cloudflare scoped API token"
              }
              autoComplete="off"
            />
            {authType === "global" ? (
              <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-300/90">
                <span className="mt-0.5 flex-shrink-0">
                  <IconShield size={12} />
                </span>
                <span>
                  The Global API Key has <strong>full</strong> access to your
                  Cloudflare account. Prefer a scoped API Token unless you
                  specifically need Global Key features.
                </span>
              </div>
            ) : (
              <p className="text-xs text-ink-500 mt-1.5 leading-relaxed">
                Required scopes: Zone Read, DNS Edit, Email Routing Rules &amp;
                Addresses, Zone Settings Edit, Cache Purge.
              </p>
            )}
            <p className="text-xs text-ink-500 mt-2">
              Get it at{" "}
              <a
                href="https://dash.cloudflare.com/profile/api-tokens"
                target="_blank"
                rel="noreferrer"
                className="text-accent-300 hover:text-accent-200"
              >
                dash.cloudflare.com/profile/api-tokens
              </a>
              {authType === "global"
                ? " (View Global API Key, bottom of the page)"
                : " (Create Token)"}
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function AuthChoice({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-lg border p-3 transition
        ${
          active
            ? "border-accent-500/40 bg-accent-500/5"
            : "border-ink-700 bg-ink-900 hover:bg-ink-850"
        }`}
    >
      <div className="text-sm font-medium text-ink-100">{title}</div>
      <div className="text-xs text-ink-400 mt-0.5">{desc}</div>
    </button>
  );
}
