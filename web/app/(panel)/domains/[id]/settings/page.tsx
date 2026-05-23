"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "../../../../../lib/api";
import { useToast } from "../../../../../components/Toast";
import Spinner from "../../../../../components/Spinner";
import Toggle from "../../../../../components/Toggle";

type Settings = {
  ssl: string | null;
  always_use_https: string | null;
};

const SSL_MODES = ["off", "flexible", "full", "strict"] as const;

export default function DomainSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const toast = useToast();
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [purgeFiles, setPurgeFiles] = useState("");

  async function load() {
    try {
      setS(await api.get<Settings>(`/api/domains/${params.id}/settings`));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Load failed");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function patch(body: Record<string, string>, ok: string) {
    setBusy(true);
    try {
      await api.patch(`/api/domains/${params.id}/settings`, body);
      toast.success(ok);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function purge(everything: boolean) {
    setBusy(true);
    try {
      await api.post(
        `/api/domains/${params.id}/cache-purge`,
        everything
          ? { purge_everything: true }
          : { files: purgeFiles.split(/\s+/).filter(Boolean) }
      );
      toast.success("Cache purged");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!s) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="card card-pad space-y-3">
        <h3 className="font-semibold text-ink-100">SSL Mode</h3>
        <div className="flex flex-wrap gap-2">
          {SSL_MODES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => patch({ ssl: m }, `SSL set to ${m}`)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition
                ${
                  s.ssl === m
                    ? "bg-accent-500 border-accent-500 text-white"
                    : "bg-ink-900 border-ink-700 text-ink-300 hover:bg-ink-800"
                }`}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-500">
          off: no encryption - flexible: HTTPS edge only - full: end-to-end -
          strict: end-to-end with valid certificate.
        </p>
      </div>

      <div className="card card-pad">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-ink-100">Always Use HTTPS</h3>
            <p className="text-xs text-ink-400 mt-0.5">
              Redirect all visitors to HTTPS automatically.
            </p>
          </div>
          <Toggle
            checked={s.always_use_https === "on"}
            onChange={(v) =>
              patch({ always_use_https: v ? "on" : "off" }, `Always HTTPS ${v ? "on" : "off"}`)
            }
            disabled={busy}
          />
        </div>
      </div>

      <div className="card card-pad space-y-3">
        <h3 className="font-semibold text-ink-100">Cache Purge</h3>
        <div>
          <label className="label">Purge specific URLs (one per line)</label>
          <textarea
            className="input min-h-[80px] font-mono"
            placeholder="https://example.com/style.css"
            value={purgeFiles}
            onChange={(e) => setPurgeFiles(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            className="btn-secondary"
            disabled={busy || !purgeFiles.trim()}
            onClick={() => purge(false)}
          >
            Purge URLs
          </button>
          <button
            className="btn-danger"
            disabled={busy}
            onClick={() => {
              if (confirm("Purge entire cache for this zone?")) purge(true);
            }}
          >
            Purge Everything
          </button>
        </div>
      </div>
    </div>
  );
}
