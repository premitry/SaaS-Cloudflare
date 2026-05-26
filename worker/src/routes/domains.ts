// Domain listing + per-domain overview.

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMw, resolveDomainAccess } from "../middleware";
import { jsonErr, jsonOk } from "../util";
import {
  CloudflareApiError,
  getRoutingSettings,
  getZone,
  listDnsRecords,
} from "../cloudflare";

export const domainsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

domainsRoutes.use("*", authMw);

// GET /api/domains?cf_account_id=&q=
domainsRoutes.get("/", async (c) => {
  const actor = c.get("actor");
  const cfId = c.req.query("cf_account_id");
  const q = c.req.query("q");

  let sql = `
    SELECT d.id, d.zone_id, d.domain, d.cf_account_id, d.status,
           a.name AS cf_account_name
      FROM domains d
      JOIN cf_accounts a ON a.id = d.cf_account_id
     WHERE 1=1
  `;
  const args: unknown[] = [];
  if (actor.type === "user") {
    sql += ` AND d.id IN (SELECT domain_id FROM user_domains WHERE user_id = ?)`;
    args.push(actor.id);
  }
  if (cfId) {
    sql += " AND d.cf_account_id = ?";
    args.push(Number(cfId));
  }
  if (q) {
    sql += " AND d.domain LIKE ?";
    args.push(`%${q}%`);
  }
  sql += " ORDER BY d.domain";
  const rows = await c.env.DB.prepare(sql)
    .bind(...args)
    .all();
  return c.json(jsonOk(rows.results ?? []));
});

// GET /api/domains/:id  -- overview (DB info)
domainsRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  return c.json(
    jsonOk({
      id: acc.domain_id,
      zone_id: acc.zone_id,
      domain: acc.domain,
      cf_account_id: acc.cf_account_id,
      perms: acc.perms,
    })
  );
});

// GET /api/domains/:id/overview  -- live data from CF
domainsRoutes.get("/:id/overview", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);

  const out: Record<string, unknown> = {
    id: acc.domain_id,
    zone_id: acc.zone_id,
    domain: acc.domain,
    perms: acc.perms,
  };
  try {
    const [zone, records, routing] = await Promise.all([
      getZone(acc.auth, acc.zone_id).catch(() => null),
      listDnsRecords(acc.auth, acc.zone_id).catch(() => [] as never),
      acc.perms.can_email
        ? getRoutingSettings(acc.auth, acc.zone_id).catch(() => null)
        : Promise.resolve(null),
    ]);
    out.zone = zone;
    out.dns_record_count = Array.isArray(records) ? records.length : 0;
    out.email_routing = routing;
  } catch (e) {
    if (e instanceof CloudflareApiError) {
      return c.json(jsonErr(e.message), 502);
    }
    return c.json(jsonErr("cloudflare error"), 502);
  }
  return c.json(jsonOk(out));
});

// GET /api/domains/:id/setup-check  -- DNS / Email / SSL checker
domainsRoutes.get("/:id/setup-check", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);

  const out = {
    dns: { a: false, mx: false, spf: false },
    email: { routing_enabled: false, catch_all_enabled: false },
    ssl: { ssl_active: false, https_enabled: false },
  };
  try {
    const records = (await listDnsRecords(acc.auth, acc.zone_id)) as Array<{
      type: string;
      content: string;
    }>;
    out.dns.a = records.some((r) => r.type === "A");
    out.dns.mx = records.some((r) => r.type === "MX");
    out.dns.spf = records.some(
      (r) => r.type === "TXT" && /v=spf1/i.test(r.content)
    );
  } catch {
    /* ignore */
  }
  try {
    const r = (await getRoutingSettings(acc.auth, acc.zone_id)) as {
      enabled?: boolean;
      status?: string;
    };
    out.email.routing_enabled = !!r?.enabled || r?.status === "ready";
    if (out.email.routing_enabled) {
      const cfMod = await import("../cloudflare");
      const ca = (await cfMod.getCatchAllRule(acc.auth, acc.zone_id).catch(
        () => null
      )) as { enabled?: boolean } | null;
      out.email.catch_all_enabled = !!ca?.enabled;
    }
  } catch {
    /* ignore */
  }
  try {
    const cfMod = await import("../cloudflare");
    const ssl = (await cfMod
      .getZoneSetting(acc.auth, acc.zone_id, "ssl")
      .catch(() => null)) as { value?: string } | null;
    out.ssl.ssl_active = !!ssl?.value && ssl.value !== "off";
    const ahttps = (await cfMod
      .getZoneSetting(acc.auth, acc.zone_id, "always_use_https")
      .catch(() => null)) as { value?: string } | null;
    out.ssl.https_enabled = ahttps?.value === "on";
  } catch {
    /* ignore */
  }
  return c.json(jsonOk(out));
});
