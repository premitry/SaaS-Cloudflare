"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "../../../../lib/api";
import { useToast } from "../../../../components/Toast";
import Spinner from "../../../../components/Spinner";
import { IconCheck, IconWarn } from "../../../../components/Icon";
import { relTime } from "../../../../lib/format";

type Overview = {
  id: number;
  zone_id: string;
  domain: string;
  zone?: {
    status?: string;
    modified_on?: string;
    name_servers?: string[];
    plan?: { name?: string };
  };
  dns_record_count?: number;
  email_routing?: { enabled?: boolean; status?: string } | null;
};

type SetupCheck = {
  dns: { a: boolean; mx: boolean; spf: boolean };
  email: { routing_enabled: boolean; catch_all_enabled: boolean };
  ssl: { ssl_active: boolean; https_enabled: boolean };
};

export default function DomainOverviewPage({
  params,
}: {
  params: { id: string };
}) {
  const toast = useToast();
  const [ov, setOv] = useState<Overview | null>(null);
  const [check, setCheck] = useState<SetupCheck | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, c] = await Promise.all([
          api.get<Overview>(`/api/domains/${params.id}/overview`),
          api.get<SetupCheck>(`/api/domains/${params.id}/setup-check`).catch(() => null),
        ]);
        setOv(o);
        setCheck(c);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) return <Spinner />;
  if (!ov) return <p className="text-ink-400">No data.</p>;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Status" value={ov.zone?.status ?? "-"} />
        <Stat
          label="Email Routing"
          value={
            ov.email_routing
              ? ov.email_routing.enabled || ov.email_routing.status === "ready"
                ? "Enabled"
                : "Disabled"
              : "-"
          }
        />
        <Stat label="DNS Records" value={String(ov.dns_record_count ?? "-")} />
        <Stat label="Last Edited" value={relTime(ov.zone?.modified_on)} />
      </div>

      {ov.zone?.name_servers && ov.zone.name_servers.length > 0 && (
        <div className="card card-pad">
          <h3 className="font-semibold text-ink-100 mb-2">Name Servers</h3>
          <ul className="font-mono text-sm text-ink-300 space-y-1">
            {ov.zone.name_servers.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {check && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CheckCard
            title="DNS Checker"
            items={[
              { label: "A Record", ok: check.dns.a },
              { label: "MX Record", ok: check.dns.mx },
              { label: "SPF Record", ok: check.dns.spf },
            ]}
          />
          <CheckCard
            title="Email Checker"
            items={[
              { label: "Routing Enabled", ok: check.email.routing_enabled },
              { label: "Catch-All", ok: check.email.catch_all_enabled },
            ]}
          />
          <CheckCard
            title="SSL Checker"
            items={[
              { label: "SSL Active", ok: check.ssl.ssl_active },
              { label: "HTTPS Enabled", ok: check.ssl.https_enabled },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card card-pad">
      <div className="text-xs uppercase tracking-wide text-ink-400">{label}</div>
      <div className="text-lg font-semibold text-ink-100 mt-1.5">{value}</div>
    </div>
  );
}

function CheckCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; ok: boolean }>;
}) {
  return (
    <div className="card card-pad">
      <h3 className="font-semibold text-ink-100 mb-2">{title}</h3>
      <ul className="space-y-1.5 text-sm">
        {items.map((it) => (
          <li key={it.label} className="flex items-center gap-2">
            {it.ok ? (
              <span className="text-emerald-400">
                <IconCheck size={14} />
              </span>
            ) : (
              <span className="text-amber-400">
                <IconWarn size={14} />
              </span>
            )}
            <span className={it.ok ? "text-ink-200" : "text-ink-300"}>
              {it.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
