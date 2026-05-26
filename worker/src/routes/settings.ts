// Domain settings routes (SSL, Always HTTPS, cache purge).

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { authMw, requirePerm, resolveDomainAccess } from "../middleware";
import { audit } from "../audit";
import { jsonErr, jsonOk } from "../util";
import {
  CloudflareApiError,
  getZoneSetting,
  patchZoneSetting,
  purgeCache,
} from "../cloudflare";

export const settingsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

settingsRoutes.use("*", authMw);

function err(e: unknown) {
  if (e instanceof CloudflareApiError) return { ok: false as const, error: e.message };
  return { ok: false as const, error: "cloudflare error" };
}

// GET /api/domains/:id/settings
settingsRoutes.get("/:id/settings", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_domain_settings");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  try {
    const [ssl, alwaysHttps] = await Promise.all([
      getZoneSetting(acc.auth, acc.zone_id, "ssl").catch(() => null),
      getZoneSetting(acc.auth, acc.zone_id, "always_use_https").catch(() => null),
    ]);
    return c.json(
      jsonOk({
        ssl: (ssl as { value?: string } | null)?.value ?? null,
        always_use_https: (alwaysHttps as { value?: string } | null)?.value ?? null,
      })
    );
  } catch (e) {
    return c.json(err(e), 502);
  }
});

// PATCH /api/domains/:id/settings   { ssl?: 'off'|'flexible'|'full'|'strict', always_use_https?: 'on'|'off' }
settingsRoutes.patch("/:id/settings", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_domain_settings");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  const body = await c.req
    .json<{ ssl?: string; always_use_https?: string }>()
    .catch(() => ({}));
  try {
    if (body.ssl) {
      await patchZoneSetting(acc.auth, acc.zone_id, "ssl", body.ssl);
      await audit(c, "settings.ssl.update", `${acc.domain}=${body.ssl}`, acc.cf_account_id);
    }
    if (body.always_use_https) {
      await patchZoneSetting(
        acc.auth,
        acc.zone_id,
        "always_use_https",
        body.always_use_https
      );
      await audit(
        c,
        "settings.always_https.update",
        `${acc.domain}=${body.always_use_https}`,
        acc.cf_account_id
      );
    }
    return c.json(jsonOk({ updated: true }));
  } catch (e) {
    return c.json(err(e), 502);
  }
});

// POST /api/domains/:id/cache-purge   { purge_everything?: bool, files?: string[] }
settingsRoutes.post("/:id/cache-purge", async (c) => {
  const id = Number(c.req.param("id"));
  const acc = await resolveDomainAccess(c, id);
  if ("error" in acc) return c.json(jsonErr(acc.error), acc.status as 400);
  const need = requirePerm(acc, "can_domain_settings");
  if (need) return c.json(jsonErr(need.error), need.status as 403);
  const body = await c.req
    .json<{ purge_everything?: boolean; files?: string[] }>()
    .catch(() => ({}));
  const payload =
    body.files && body.files.length > 0
      ? { files: body.files }
      : { purge_everything: true };
  try {
    const r = await purgeCache(acc.auth, acc.zone_id, payload);
    await audit(
      c,
      "settings.cache_purge",
      `${acc.domain}: ${body.files?.length ? body.files.join(",") : "all"}`,
      acc.cf_account_id
    );
    return c.json(jsonOk(r));
  } catch (e) {
    return c.json(err(e), 502);
  }
});
