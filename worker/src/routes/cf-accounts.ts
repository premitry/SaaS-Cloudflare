// Cloudflare account management (admin only).
// Connect via API token or Global API Key, list, sync zones, delete.

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { adminOnly, authMw } from "../middleware";
import { audit } from "../audit";
import { jsonErr, jsonOk } from "../util";
import {
  authFromRow,
  CloudflareApiError,
  type CfAuth,
  createDestination,
  deleteDestination,
  listAccounts,
  listDestinations,
  listZones,
  verifyAuth,
} from "../cloudflare";

export const cfAccountsRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

cfAccountsRoutes.use("*", authMw, adminOnly);

type ConnectBody = {
  name?: string;
  email?: string;
  api_type?: "token" | "global";
  api_token?: string; // either the API token, or the Global API Key when api_type=global
};

function buildAuth(body: ConnectBody): CfAuth | { error: string } {
  const apiType = body.api_type === "global" ? "global" : "token";
  if (apiType === "global") {
    if (!body.email) return { error: "email is required for Global API Key auth" };
    if (!body.api_token) return { error: "api_token (your Global API Key) is required" };
    return { type: "global", email: body.email, key: body.api_token };
  }
  if (!body.api_token) return { error: "api_token is required" };
  return { type: "token", token: body.api_token };
}

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

// POST /api/cf-accounts  { name, email?, api_type?, api_token }
cfAccountsRoutes.post("/", async (c) => {
  const body = await c.req.json<ConnectBody>().catch(() => ({} as ConnectBody));
  if (!body.name) return c.json(jsonErr("name is required"), 400);

  const built = buildAuth(body);
  if ("error" in built) return c.json(jsonErr(built.error), 400);
  const auth = built;

  // validate against Cloudflare
  try {
    await verifyAuth(auth);
  } catch (e) {
    const msg =
      e instanceof CloudflareApiError ? e.message : "credential verify failed";
    return c.json(jsonErr(`Cloudflare credentials invalid: ${msg}`), 400);
  }

  // try to capture the account id (best-effort; tokens may be zone-scoped)
  let accountId: string | null = null;
  try {
    const accs = await listAccounts(auth);
    if (Array.isArray(accs) && accs.length > 0) accountId = accs[0].id;
  } catch {
    accountId = null;
  }

  const apiType = auth.type === "global" ? "global" : "token";
  const credential = auth.type === "global" ? auth.key : auth.token;
  const emailValue =
    auth.type === "global" ? auth.email : body.email ?? null;

  const ins = await c.env.DB.prepare(
    `INSERT INTO cf_accounts (name, email, api_type, api_token, account_id)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(body.name, emailValue, apiType, credential, accountId)
    .run();
  const id = Number(ins.meta.last_row_id);
  await audit(c, "cf_account.create", body.name, id);

  // initial zone sync (best-effort)
  try {
    await syncZonesForAccount(c.env, id, auth);
  } catch {
    /* ignore */
  }

  return c.json(
    jsonOk({ id, name: body.name, account_id: accountId, api_type: apiType })
  );
});

// PATCH /api/cf-accounts/:id  { name?, email?, api_type?, api_token? }
cfAccountsRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<ConnectBody>().catch(() => ({} as ConnectBody));

  const cur = await c.env.DB.prepare(
    "SELECT id, api_type, api_token, email FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first<{
      id: number;
      api_type: string | null;
      api_token: string;
      email: string | null;
    }>();
  if (!cur) return c.json(jsonErr("not found"), 404);

  // If credentials are being updated, validate them
  const wantsCredentialChange =
    body.api_token !== undefined || body.api_type !== undefined;
  if (wantsCredentialChange) {
    const merged: ConnectBody = {
      api_type: body.api_type ?? (cur.api_type === "global" ? "global" : "token"),
      api_token: body.api_token ?? cur.api_token,
      email: body.email ?? cur.email ?? undefined,
    };
    const built = buildAuth(merged);
    if ("error" in built) return c.json(jsonErr(built.error), 400);
    try {
      await verifyAuth(built);
    } catch (e) {
      const msg =
        e instanceof CloudflareApiError ? e.message : "credential verify failed";
      return c.json(jsonErr(`Cloudflare credentials invalid: ${msg}`), 400);
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
  if (body.api_type !== undefined) {
    sets.push("api_type = ?");
    args.push(body.api_type === "global" ? "global" : "token");
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
    "SELECT id, api_type, api_token, email FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first<{
      id: number;
      api_type: string | null;
      api_token: string;
      email: string | null;
    }>();
  if (!acct) return c.json(jsonErr("not found"), 404);
  try {
    const auth = authFromRow(acct);
    const { added, updated, total } = await syncZonesForAccount(
      c.env,
      acct.id,
      auth
    );
    await audit(c, "cf_account.sync", String(id), id);
    return c.json(jsonOk({ added, updated, total }));
  } catch (e) {
    const msg = e instanceof CloudflareApiError ? e.message : (e as Error).message;
    return c.json(jsonErr(msg), 500);
  }
});

export async function syncZonesForAccount(
  env: Env,
  accountId: number,
  auth: CfAuth
): Promise<{ added: number; updated: number; total: number }> {
  const zones = await listZones(auth);
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
    "SELECT api_type, api_token, email, account_id FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first<{
      api_type: string | null;
      api_token: string;
      email: string | null;
      account_id: string | null;
    }>();
  if (!acct) return c.json(jsonErr("not found"), 404);
  if (!acct.account_id)
    return c.json(jsonErr("cf_account has no account_id; reconnect"), 400);
  try {
    const auth = authFromRow(acct);
    const r = await listDestinations(auth, acct.account_id);
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
    "SELECT api_type, api_token, email, account_id FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first<{
      api_type: string | null;
      api_token: string;
      email: string | null;
      account_id: string | null;
    }>();
  if (!acct?.account_id)
    return c.json(jsonErr("cf_account has no account_id"), 400);
  try {
    const auth = authFromRow(acct);
    const r = await createDestination(auth, acct.account_id, body.email);
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
    "SELECT api_type, api_token, email, account_id FROM cf_accounts WHERE id = ?"
  )
    .bind(id)
    .first<{
      api_type: string | null;
      api_token: string;
      email: string | null;
      account_id: string | null;
    }>();
  if (!acct?.account_id)
    return c.json(jsonErr("cf_account has no account_id"), 400);
  try {
    const auth = authFromRow(acct);
    const r = await deleteDestination(auth, acct.account_id, destId);
    await audit(c, "email.destination.delete", destId, id);
    return c.json(jsonOk(r));
  } catch (e) {
    const msg = e instanceof CloudflareApiError ? e.message : "cloudflare error";
    return c.json(jsonErr(msg), 502);
  }
});
