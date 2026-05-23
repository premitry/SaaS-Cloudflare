"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, api } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import Spinner from "../../../components/Spinner";
import { IconGlobe, IconSearch } from "../../../components/Icon";

type CfAccount = { id: number; name: string };
type Domain = {
  id: number;
  domain: string;
  zone_id: string;
  cf_account_id: number;
  cf_account_name?: string;
  status?: string;
};

export default function DomainsPage() {
  const toast = useToast();
  const [list, setList] = useState<Domain[] | null>(null);
  const [accounts, setAccounts] = useState<CfAccount[]>([]);
  const [q, setQ] = useState("");
  const [acc, setAcc] = useState<number | "">("");

  async function load() {
    try {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (acc) params.set("cf_account_id", String(acc));
      const [ds, as] = await Promise.all([
        api.get<Domain[]>(`/api/domains?${params}`),
        accounts.length === 0
          ? api.get<CfAccount[]>("/api/cf-accounts").catch(() => [])
          : Promise.resolve(accounts),
      ]);
      setList(ds);
      if (accounts.length === 0) setAccounts(as);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Failed to load");
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, acc]);

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <header>
        <h1 className="text-xl font-semibold text-ink-100">Domains</h1>
        <p className="text-sm text-ink-400 mt-1">
          Click a domain to manage DNS, Email Routing, and Settings.
        </p>
      </header>

      <div className="card card-pad flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="label">Search</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500">
              <IconSearch size={14} />
            </span>
            <input
              className="input pl-9"
              placeholder="Search domain..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        {accounts.length > 0 && (
          <div className="min-w-[180px]">
            <label className="label">Account</label>
            <select
              className="input"
              value={acc}
              onChange={(e) => setAcc(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">All</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="card overflow-hidden">
        {list === null ? (
          <div className="p-6">
            <Spinner />
          </div>
        ) : list.length === 0 ? (
          <div className="p-8 text-center text-ink-400 text-sm">No domains.</div>
        ) : (
          <ul className="divide-y divide-ink-800">
            {list.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/domains/${d.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-ink-900"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-8 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center text-ink-400">
                      <IconGlobe size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-ink-100 font-medium">{d.domain}</div>
                      <div className="text-xs text-ink-500 font-mono truncate">
                        {d.cf_account_name ?? `Account #${d.cf_account_id}`} - {d.zone_id}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.status === "active" ? (
                      <span className="badge-green">active</span>
                    ) : d.status ? (
                      <span className="badge-amber">{d.status}</span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
