// DNS routes (per domain).

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMw, requirePerm, resolveDomainAccess } from "../middleware";
import { jsonErr, jsonOk } from "../util";
import { audit } from "../audit";
import {
  CloudflareApiError,
  createDnsRecord,
  deleteDnsRecord,
  listDnsRecords,
  updateDnsRecord,
} from "../cloudflare";

export const dnsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

dnsRoutes.use("*", authMw);

function handleCfError(e: unknown) {
  if (e instanceof CloudflareApiError) {
    return { ok: false, error: e.message } as const;
  }
  return { ok: false, error: "cloudflare error" } as const;
}

// GET /api/domains/:id/dns
dnsRoutes.get("/:id/dns", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_dns");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  try {
    const records = await listDnsRecords(acc.auth, acc.zone_id);
    return c.json(jsonOk(records));
  } catch (e) {
    const err = handleCfError(e);
    return c.json(err, 502);
  }
});

// POST /api/domains/:id/dns
dnsRoutes.post("/:id/dns", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_dns");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  const body = await c.req.json().catch(() => ({}));
  try {
    const created = await createDnsRecord(acc.auth, acc.zone_id, body);
    await audit(
      c,
      "dns.create",
      `${acc.domain}:${(body as { type?: string }).type ?? "?"} ${
        (body as { name?: string }).name ?? ""
      }`,
      acc.cf_account_id
    );
    return c.json(jsonOk(created));
  } catch (e) {
    return c.json(handleCfError(e), 502);
  }
});

// PUT /api/domains/:id/dns/:recordId
dnsRoutes.put("/:id/dns/:recordId", async (c) => {
  const id = Number(c.req.param("id"));
  const recordId = c.req.param("recordId");
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_dns");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  const body = await c.req.json().catch(() => ({}));
  try {
    const updated = await updateDnsRecord(acc.auth, acc.zone_id, recordId, body);
    await audit(c, "dns.update", `${acc.domain}:${recordId}`, acc.cf_account_id);
    return c.json(jsonOk(updated));
  } catch (e) {
    return c.json(handleCfError(e), 502);
  }
});

// DELETE /api/domains/:id/dns/:recordId
dnsRoutes.delete("/:id/dns/:recordId", async (c) => {
  const id = Number(c.req.param("id"));
  const recordId = c.req.param("recordId");
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_dns");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  try {
    const r = await deleteDnsRecord(acc.auth, acc.zone_id, recordId);
    await audit(c, "dns.delete", `${acc.domain}:${recordId}`, acc.cf_account_id);
    return c.json(jsonOk(r));
  } catch (e) {
    return c.json(handleCfError(e), 502);
  }
});
