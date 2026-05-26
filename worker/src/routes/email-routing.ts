// Email routing routes.

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMw, requirePerm, resolveDomainAccess } from "../middleware";
import { audit } from "../audit";
import { jsonErr, jsonOk } from "../util";
import {
  CloudflareApiError,
  createRoutingRule,
  deleteRoutingRule,
  disableRouting,
  enableRouting,
  getCatchAllRule,
  getRoutingSettings,
  listRoutingRules,
  updateCatchAllRule,
  updateRoutingRule,
} from "../cloudflare";

export const emailRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

emailRoutes.use("*", authMw);

function err(e: unknown) {
  if (e instanceof CloudflareApiError) return { ok: false as const, error: e.message };
  return { ok: false as const, error: "cloudflare error" };
}

// GET /api/domains/:id/email-routing
emailRoutes.get("/:id/email-routing", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_email");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  try {
    const [settings, rules, catchAll] = await Promise.all([
      getRoutingSettings(acc.auth, acc.zone_id).catch(() => null),
      listRoutingRules(acc.auth, acc.zone_id).catch(() => []),
      getCatchAllRule(acc.auth, acc.zone_id).catch(() => null),
    ]);
    return c.json(jsonOk({ settings, rules, catch_all: catchAll }));
  } catch (e) {
    return c.json(err(e), 502);
  }
});

// POST /api/domains/:id/email-routing/enable
emailRoutes.post("/:id/email-routing/enable", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_email");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  try {
    const r = await enableRouting(acc.auth, acc.zone_id);
    await audit(c, "email.enable", acc.domain, acc.cf_account_id);
    return c.json(jsonOk(r));
  } catch (e) {
    return c.json(err(e), 502);
  }
});

// POST /api/domains/:id/email-routing/disable
emailRoutes.post("/:id/email-routing/disable", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_email");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  try {
    const r = await disableRouting(acc.auth, acc.zone_id);
    await audit(c, "email.disable", acc.domain, acc.cf_account_id);
    return c.json(jsonOk(r));
  } catch (e) {
    return c.json(err(e), 502);
  }
});

// POST /api/domains/:id/email-routing/rules  -- create forward rule
//   body: { match: "support@domain.com", forward_to: "x@gmail.com", name?: string, enabled?: boolean }
emailRoutes.post("/:id/email-routing/rules", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_email");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  const body = await c.req
    .json<{
      match?: string;
      forward_to?: string;
      name?: string;
      enabled?: boolean;
    }>()
    .catch(() => ({}));
  if (!body.match || !body.forward_to) {
    return c.json(jsonErr("match and forward_to are required"), 400);
  }
  const rule = {
    name: body.name ?? `Forward ${body.match} to ${body.forward_to}`,
    enabled: body.enabled ?? true,
    matchers: [{ type: "literal", field: "to", value: body.match }],
    actions: [{ type: "forward", value: [body.forward_to] }],
    priority: 0,
  };
  try {
    const r = await createRoutingRule(acc.auth, acc.zone_id, rule);
    await audit(
      c,
      "email.rule.create",
      `${acc.domain}: ${body.match} -> ${body.forward_to}`,
      acc.cf_account_id
    );
    return c.json(jsonOk(r));
  } catch (e) {
    return c.json(err(e), 502);
  }
});

// PUT /api/domains/:id/email-routing/rules/:ruleId
emailRoutes.put("/:id/email-routing/rules/:ruleId", async (c) => {
  const id = Number(c.req.param("id"));
  const ruleId = c.req.param("ruleId");
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_email");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  const body = await c.req.json().catch(() => ({}));
  try {
    const r = await updateRoutingRule(acc.auth, acc.zone_id, ruleId, body);
    await audit(c, "email.rule.update", `${acc.domain}:${ruleId}`, acc.cf_account_id);
    return c.json(jsonOk(r));
  } catch (e) {
    return c.json(err(e), 502);
  }
});

// DELETE /api/domains/:id/email-routing/rules/:ruleId
emailRoutes.delete("/:id/email-routing/rules/:ruleId", async (c) => {
  const id = Number(c.req.param("id"));
  const ruleId = c.req.param("ruleId");
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_email");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  try {
    const r = await deleteRoutingRule(acc.auth, acc.zone_id, ruleId);
    await audit(c, "email.rule.delete", `${acc.domain}:${ruleId}`, acc.cf_account_id);
    return c.json(jsonOk(r));
  } catch (e) {
    return c.json(err(e), 502);
  }
});

// PUT /api/domains/:id/email-routing/catch-all
//   body: { enabled: boolean, forward_to?: string }
emailRoutes.put("/:id/email-routing/catch-all", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_email");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  const body = await c.req
    .json<{ enabled?: boolean; forward_to?: string; name?: string }>()
    .catch(() => ({}));
  const enabled = !!body.enabled;
  const payload = {
    name: body.name ?? "Catch-all",
    enabled,
    matchers: [{ type: "all" }],
    actions: enabled
      ? body.forward_to
        ? [{ type: "forward", value: [body.forward_to] }]
        : [{ type: "drop" }]
      : [{ type: "drop" }],
  };
  try {
    const r = await updateCatchAllRule(acc.auth, acc.zone_id, payload);
    await audit(
      c,
      "email.catch_all.update",
      `${acc.domain}: enabled=${enabled} -> ${body.forward_to ?? "drop"}`,
      acc.cf_account_id
    );
    return c.json(jsonOk(r));
  } catch (e) {
    return c.json(err(e), 502);
  }
});

// GET /api/cf-accounts/:cfId/destinations  -- moved to cf-accounts.ts
// POST /api/cf-accounts/:cfId/destinations  -- moved to cf-accounts.ts
// DELETE /api/cf-accounts/:cfId/destinations/:destId  -- moved to cf-accounts.ts
