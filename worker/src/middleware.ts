// Hono middleware: CORS, auth, role/permission guards, error handling.

import type { Context, Next } from "hono";
import { verifyJwt } from "./auth";
import { authFromRow, type CfAuth } from "./cloudflare";
import type { Env, Variables, Actor } from "./types";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

export async function corsMw(c: Ctx, next: Next) {
  const allow = (c.env.ALLOWED_ORIGINS ?? "*").trim();
  const origin = c.req.header("Origin") ?? "";
  let allowed = false;
  let allowOriginHeader = "";
  if (allow === "*" || allow === "") {
    allowed = true;
    allowOriginHeader = origin || "*";
  } else {
    const list = allow.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.includes(origin)) {
      allowed = true;
      allowOriginHeader = origin;
    }
  }
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "Authorization,Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
  if (allowed) headers["Access-Control-Allow-Origin"] = allowOriginHeader;
  if (c.req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  await next();
  for (const [k, v] of Object.entries(headers)) {
    c.res.headers.set(k, v);
  }
}

async function loadActor(c: Ctx): Promise<Actor | null> {
  const authz = c.req.header("Authorization");
  if (!authz?.startsWith("Bearer ")) return null;
  const token = authz.slice(7).trim();
  if (!c.env.JWT_SECRET) return null;
  const payload = await verifyJwt(token, c.env.JWT_SECRET);
  if (!payload) return null;
  if (payload.type === "admin") {
    const row = await c.env.DB.prepare(
      "SELECT id, username FROM admins WHERE id = ?"
    )
      .bind(payload.id)
      .first<{ id: number; username: string }>();
    if (!row) return null;
    return { type: "admin", id: row.id, username: row.username };
  }
  const row = await c.env.DB.prepare(
    `SELECT id, cf_account_id, login_code, expired_at, is_permanent
       FROM users WHERE id = ?`
  )
    .bind(payload.id)
    .first<{
      id: number;
      cf_account_id: number;
      login_code: string;
      expired_at: string | null;
      is_permanent: number;
    }>();
  if (!row) return null;
  if (row.login_code !== payload.code) return null;
  if (!row.is_permanent && row.expired_at) {
    const exp = new Date(row.expired_at.replace(" ", "T") + "Z").getTime();
    if (exp < Date.now()) return null;
  }
  return {
    type: "user",
    id: row.id,
    cf_account_id: row.cf_account_id,
    login_code: row.login_code,
  };
}

export async function authMw(c: Ctx, next: Next) {
  const actor = await loadActor(c);
  if (!actor) return c.json({ ok: false, error: "unauthorized" }, 401);
  c.set("actor", actor);
  await next();
}

export async function adminOnly(c: Ctx, next: Next) {
  const actor = c.get("actor");
  if (actor?.type !== "admin") {
    return c.json({ ok: false, error: "forbidden: admin only" }, 403);
  }
  await next();
}

export async function userOnly(c: Ctx, next: Next) {
  const actor = c.get("actor");
  if (actor?.type !== "user") {
    return c.json({ ok: false, error: "forbidden: user only" }, 403);
  }
  await next();
}

// Permission check helpers used inside route handlers.
export type DomainAccess = {
  domain_id: number;
  zone_id: string;
  domain: string;
  cf_account_id: number;
  auth: CfAuth;                          // ready-to-use credentials
  cf_account_external_id: string | null;
  perms: {
    can_dns: boolean;
    can_email: boolean;
    can_domain_settings: boolean;
    can_full_access: boolean;
  };
};

export async function resolveDomainAccess(
  c: Ctx,
  domainId: number
): Promise<DomainAccess | { error: string; status: number }> {
  const actor = c.get("actor");
  if (!actor) return { error: "unauthorized", status: 401 };

  const dom = await c.env.DB.prepare(
    `SELECT d.id AS domain_id, d.zone_id, d.domain, d.cf_account_id,
            a.api_type, a.api_token, a.email AS cf_email,
            a.account_id AS cf_account_external_id
       FROM domains d
       JOIN cf_accounts a ON a.id = d.cf_account_id
      WHERE d.id = ?`
  )
    .bind(domainId)
    .first<{
      domain_id: number;
      zone_id: string;
      domain: string;
      cf_account_id: number;
      api_type: string | null;
      api_token: string;
      cf_email: string | null;
      cf_account_external_id: string | null;
    }>();
  if (!dom) return { error: "domain not found", status: 404 };

  let auth: CfAuth;
  try {
    auth = authFromRow({
      api_type: dom.api_type,
      api_token: dom.api_token,
      email: dom.cf_email,
    });
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "credentials misconfigured",
      status: 500,
    };
  }

  const base = {
    domain_id: dom.domain_id,
    zone_id: dom.zone_id,
    domain: dom.domain,
    cf_account_id: dom.cf_account_id,
    auth,
    cf_account_external_id: dom.cf_account_external_id,
  };

  if (actor.type === "admin") {
    return {
      ...base,
      perms: {
        can_dns: true,
        can_email: true,
        can_domain_settings: true,
        can_full_access: true,
      },
    };
  }

  // user must be assigned the domain
  const ud = await c.env.DB.prepare(
    `SELECT 1 AS x FROM user_domains WHERE user_id = ? AND domain_id = ?`
  )
    .bind(actor.id, domainId)
    .first<{ x: number }>();
  if (!ud) return { error: "forbidden: domain not assigned", status: 403 };

  const perms = await c.env.DB.prepare(
    `SELECT can_dns, can_email, can_domain_settings, can_full_access
       FROM permissions WHERE user_id = ?`
  )
    .bind(actor.id)
    .first<{
      can_dns: number;
      can_email: number;
      can_domain_settings: number;
      can_full_access: number;
    }>();
  return {
    ...base,
    perms: {
      can_dns: !!(perms?.can_full_access || perms?.can_dns),
      can_email: !!(perms?.can_full_access || perms?.can_email),
      can_domain_settings: !!(perms?.can_full_access || perms?.can_domain_settings),
      can_full_access: !!perms?.can_full_access,
    },
  };
}

export function requirePerm(
  access: DomainAccess,
  perm: keyof DomainAccess["perms"]
): null | { error: string; status: number } {
  if (!access.perms[perm]) {
    return { error: `forbidden: missing ${perm}`, status: 403 };
  }
  return null;
}
