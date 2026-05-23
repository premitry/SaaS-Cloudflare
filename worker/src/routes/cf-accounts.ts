// Cloudflare account management (admin only).
// Connect via API token, list, sync zones, delete.

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { adminOnly, authMw } from "../middleware";
import { audit } from "../audit";
import { jsonErr, jsonOk } from "../util";
import {
  CloudflareApiError,
  createDestination,
  deleteDestination,
  listAccounts,
  listDestinations,
  listZones,
  verifyToken,
} from "../cloudflare";

export const cfAccountsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

cfAccountsRoutes.use("*", authMw, adminOnly);

// GET /api/cf-accounts
cfAccountsRoutes.get("/", async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT a.id, a.name, a.email, a.api_type, a.account_id, a.created_at,
            (SELECT COUNT(*) FROM domains d WHERE d.cf_account_id = a.id) AS domain_count
       FROM cf_accounts a
       ORDER BY a.id DESC`
  ).all();
  return c.json(jsonOk(rows.results ?? []));
});

// POST /api/cf-accounts  { name, email?, api_token }
cfAccountsRoutes.post("/", async (c) => {
  const body = await c.req
    .json<{ name?: string; email?: string; api_token?: string }>()
    .catch(() => ({}));
  if (!body.name || !body.api_token) {
    return c.json(jsonErr("name and api_token are required"), 400);
  }
  // validate token
  try {
    await verifyToken(body.api_token);
  } catch (e) {
    const msg = e instanceof CloudflareApiError ? e.message : "token verify failed";
    return c.json(jsonErr(`Cloudflare token invalid: ${msg}`), 400);
  }
  // try to capture the account id (best-effort; token may be zone-scoped)
  let accountId: string | null = null;
  try {
    const accs = await listAccounts(body.api_token);
    if (Array.isArray(accs) && accs.length > 0) accountId = accs[0].id;
  } catch {
    accountId = null;
  }
  const ins = await c.env.DB.prepare(
    `INSERT INTO cf_accounts (name, email, api_type, api_token, account_id)
     VALUES (?, ?, 'token', ?, ?)`
  )
    .bind(body.name, body.email ?? null, body.api_token, accountId)
    .run();
  const id = Number(ins.meta.last_row_id);
  await audit(c, "cf_account.create", body.name, id);

  // initial zone sync (best-effort, don't fail the create on this)
  try {
    await syncZonesForAccount(c.env, id, body.api_token);
  } catch {
    /* ignore */
  }

  return c.json(jsonOk({ id, name: body.name, account_id: accountId }));
});

// PATCH /api/cf-accounts/:id  { name?, email?, api_token? }
cfAccountsRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req
    .json<{ name?: string; email?: string; api_token?: string }>()
    .catch(() => ({}));
  const cur = await c.env.DB.prepare(
    "SELECT id FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first();
  if (!cur) return c.json(jsonErr("not found"), 404);
  if (body.api_token) {
    try {
      await verifyToken(body.api_token);
    } catch (e) {
      const msg = e instanceof CloudflareApiError ? e.message : "token verify failed";
      return c.json(jsonErr(`Cloudflare token invalid: ${msg}`), 400);
    }
  }
  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.name !== undefined) {
    sets.push("name = ?");
    args.push(body.name);
  }
  if (body.email !== undefined) {
    sets.push("email = ?");
    args.push(body.email);
  }
  if (body.api_token !== undefined) {
    sets.push("api_token = ?");
    args.push(body.api_token);
  }
  if (sets.length === 0) return c.json(jsonOk({ updated: false }));
  args.push(id);
  await c.env.DB.prepare(
    `UPDATE cf_accounts SET ${sets.join(", ")} WHERE id = ?`
  )
    .bind(...args)
    .run();
  await audit(c, "cf_account.update", String(id), id);
  return c.json(jsonOk({ updated: true }));
});

// DELETE /api/cf-accounts/:id
cfAccountsRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  await c.env.DB.prepare("DELETE FROM cf_accounts WHERE id = ?").bind(id).run();
  await audit(c, "cf_account.delete", String(id), id);
  return c.json(jsonOk({ deleted: true }));
});

// POST /api/cf-accounts/:id/sync  -- pull latest zones into D1
cfAccountsRoutes.post("/:id/sync", async (c) => {
  const id = Number(c.req.param("id"));
  const acct = await c.env.DB.prepare(
    "SELECT id, api_token FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first<{ id: number; api_token: string }>();
  if (!acct) return c.json(jsonErr("not found"), 404);
  try {
    const { added, updated, total } = await syncZonesForAccount(
      c.env,
      acct.id,
      acct.api_token
    );
    await audit(c, "cf_account.sync", String(id), id);
    return c.json(jsonOk({ added, updated, total }));
  } catch (e) {
    const msg = e instanceof CloudflareApiError ? e.message : "sync failed";
    return c.json(jsonErr(msg), 500);
  }
});

export async function syncZonesForAccount(
  env: Env,
  accountId: number,
  token: string
): Promise<{ added: number; updated: number; total: number }> {
  const zones = await listZones(token);
  let added = 0;
  let updated = 0;
  for (const z of zones) {
    const existing = await env.DB.prepare(
      "SELECT id FROM domains WHERE zone_id = ?"
    )
      .bind(z.id)
      .first<{ id: number }>();
    if (existing) {
      await env.DB.prepare(
        "UPDATE domains SET cf_account_id = ?, domain = ?, status = ?, synced_at = datetime('now') WHERE id = ?"
      )
        .bind(accountId, z.name, z.status, existing.id)
        .run();
      updated++;
    } else {
      await env.DB.prepare(
        "INSERT INTO domains (cf_account_id, zone_id, domain, status) VALUES (?, ?, ?, ?)"
      )
        .bind(accountId, z.id, z.name, z.status)
        .run();
      added++;
    }
  }
  return { added, updated, total: zones.length };
}



// ----- Email destinations (account-scoped) -----

// GET /api/cf-accounts/:id/destinations
cfAccountsRoutes.get("/:id/destinations", async (c) => {
  const id = Number(c.req.param("id"));
  const acct = await c.env.DB.prepare(
    "SELECT api_token, account_id FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first<{ api_token: string; account_id: string | null }>();
  if (!acct) return c.json(jsonErr("not found"), 404);
  if (!acct.account_id)
    return c.json(jsonErr("cf_account has no account_id; reconnect token"), 400);
  try {
    const r = await listDestinations(acct.api_token, acct.account_id);
    return c.json(jsonOk(r));
  } catch (e) {
    const msg = e instanceof CloudflareApiError ? e.message : "cloudflare error";
    return c.json(jsonErr(msg), 502);
  }
});

// POST /api/cf-accounts/:id/destinations  { email }
cfAccountsRoutes.post("/:id/destinations", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<{ email?: string }>().catch(() => ({}));
  if (!body.email) return c.json(jsonErr("email is required"), 400);
  const acct = await c.env.DB.prepare(
    "SELECT api_token, account_id FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first<{ api_token: string; account_id: string | null }>();
  if (!acct?.account_id) return c.json(jsonErr("cf_account has no account_id"), 400);
  try {
    const r = await createDestination(acct.api_token, acct.account_id, body.email);
    await audit(c, "email.destination.create", body.email, id);
    return c.json(jsonOk(r));
  } catch (e) {
    const msg = e instanceof CloudflareApiError ? e.message : "cloudflare error";
    return c.json(jsonErr(msg), 502);
  }
});

// DELETE /api/cf-accounts/:id/destinations/:destId
cfAccountsRoutes.delete("/:id/destinations/:destId", async (c) => {
  const id = Number(c.req.param("id"));
  const destId = c.req.param("destId");
  const acct = await c.env.DB.prepare(
    "SELECT api_token, account_id FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first<{ api_token: string; account_id: string | null }>();
  if (!acct?.account_id) return c.json(jsonErr("cf_account has no account_id"), 400);
  try {
    const r = await deleteDestination(acct.api_token, acct.account_id, destId);
    await audit(c, "email.destination.delete", destId, id);
    return c.json(jsonOk(r));
  } catch (e) {
    const msg = e instanceof CloudflareApiError ? e.message : "cloudflare error";
    return c.json(jsonErr(msg), 502);
  }
});
