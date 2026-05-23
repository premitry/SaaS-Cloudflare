"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "../../../../lib/api";
import { IconGlobe } from "../../../../components/Icon";

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

export default function DomainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const pathname = usePathname() ?? "";
  const [info, setInfo] = useState<DomInfo | null>(null);

  useEffect(() => {
    api
      .get<DomInfo>(`/api/domains/${params.id}`)
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [params.id]);

  const tabs: Array<{ href: string; label: string; show: boolean }> = [
    { href: ``, label: "Overview", show: true },
    { href: `/dns`, label: "DNS", show: info?.perms.can_dns ?? true },
    {
      href: `/email-routing`,
      label: "Email Routing",
      show: info?.perms.can_email ?? true,
    },
    {
      href: `/settings`,
      label: "Domain Settings",
      show: info?.perms.can_domain_settings ?? true,
    },
    {
      href: `/security`,
      label: "Security",
      show: info?.perms.can_full_access ?? false,
    },
  ];

  const base = `/domains/${params.id}`;

  return (
    <div className="p-6 space-y-5 max-w-7xl">
      <header className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-ink-800 border border-ink-700 flex items-center justify-center">
          <IconGlobe size={16} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-ink-100">
            {info?.domain ?? "Loading..."}
          </h1>
          {info?.zone_id ? (
            <div className="text-xs text-ink-500 font-mono">{info.zone_id}</div>
          ) : null}
        </div>
      </header>

      <div className="border-b border-ink-700">
        <div className="flex gap-1 -mb-px overflow-x-auto">
          {tabs
            .filter((t) => t.show)
            .map((t) => {
              const href = `${base}${t.href}`;
              const active =
                pathname === href ||
                (t.href === "" && pathname === base);
              return (
                <Link
                  key={t.href}
                  href={href}
                  className={`tab-link ${active ? "tab-link-active" : ""}`}
                >
                  {t.label}
                </Link>
              );
            })}
        </div>
      </div>

      <div>{children}</div>
    </div>
  );
}
