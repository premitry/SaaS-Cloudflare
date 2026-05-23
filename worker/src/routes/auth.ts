// Authentication routes: admin login, user login (CODE), bootstrap, /me.

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { hashPassword, signJwt, verifyPassword } from "../auth";
import { auditAnon } from "../audit";
import { getClientIp, jsonErr, jsonOk } from "../util";
import { authMw } from "../middleware";

const ADMIN_TTL = 60 * 60 * 8; // 8h
const USER_TTL = 60 * 60 * 12; // 12h

export const authRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

// POST /api/admin/bootstrap  -- creates the first admin if none exists
authRoutes.post("/admin/bootstrap", async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch(
    () => ({})
  );
  if (!body.username || !body.password) {
    return c.json(jsonErr("username and password are required"), 400);
  }
  const existing = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM admins"
  ).first<{ n: number }>();
  if ((existing?.n ?? 0) > 0) {
    return c.json(jsonErr("admin already exists"), 409);
  }
  const { hash, salt } = await hashPassword(body.password);
  await c.env.DB.prepare(
    "INSERT INTO admins (username, password_hash, password_salt) VALUES (?, ?, ?)"
  )
    .bind(body.username, hash, salt)
    .run();
  return c.json(jsonOk({ created: true }));
});

// POST /api/admin/login
authRoutes.post("/admin/login", async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>().catch(
    () => ({})
  );
  if (!body.username || !body.password) {
    return c.json(jsonErr("username and password are required"), 400);
  }
  const ip = getClientIp(c);

  // First-run convenience: if no admin exists yet, accept any creds and create the admin.
  const count = await c.env.DB.prepare(
    "SELECT COUNT(*) AS n FROM admins"
  ).first<{ n: number }>();
  if ((count?.n ?? 0) === 0) {
    const { hash, salt } = await hashPassword(body.password);
    const res = await c.env.DB.prepare(
      "INSERT INTO admins (username, password_hash, password_salt) VALUES (?, ?, ?)"
    )
      .bind(body.username, hash, salt)
      .run();
    const id = Number(res.meta.last_row_id);
    const { token, expiresAt } = await signJwt(
      { sub: `admin:${id}`, type: "admin", id, username: body.username },
      c.env.JWT_SECRET,
      ADMIN_TTL
    );
    await auditAnon(c.env, ip, "admin.bootstrap", body.username, null, "admin", null);
    return c.json(
      jsonOk({
        token,
        expires_at: expiresAt,
        actor: { type: "admin", id, username: body.username },
      })
    );
  }

  const row = await c.env.DB.prepare(
    "SELECT id, username, password_hash, password_salt FROM admins WHERE username = ?"
  )
    .bind(body.username)
    .first<{
      id: number;
      username: string;
      password_hash: string;
      password_salt: string;
    }>();
  if (!row) {
    await auditAnon(c.env, ip, "admin.login.fail", body.username, null, "admin", null);
    return c.json(jsonErr("invalid credentials"), 401);
  }
  const ok = await verifyPassword(body.password, row.password_hash, row.password_salt);
  if (!ok) {
    await auditAnon(c.env, ip, "admin.login.fail", body.username, null, "admin", null);
    return c.json(jsonErr("invalid credentials"), 401);
  }
  const { token, expiresAt } = await signJwt(
    { sub: `admin:${row.id}`, type: "admin", id: row.id, username: row.username },
    c.env.JWT_SECRET,
    ADMIN_TTL
  );
  await auditAnon(c.env, ip, "admin.login", row.username, null, "admin", null);
  return c.json(
    jsonOk({
      token,
      expires_at: expiresAt,
      actor: { type: "admin", id: row.id, username: row.username },
    })
  );
});

// POST /api/admin/change-password
authRoutes.post("/admin/change-password", authMw, async (c) => {
  const actor = c.get("actor");
  if (actor.type !== "admin") return c.json(jsonErr("forbidden"), 403);
  const body = await c.req
    .json<{ current_password?: string; new_password?: string }>()
    .catch(() => ({}));
  if (!body.current_password || !body.new_password) {
    return c.json(jsonErr("current_password and new_password are required"), 400);
  }
  const row = await c.env.DB.prepare(
    "SELECT password_hash, password_salt FROM admins WHERE id = ?"
  )
    .bind(actor.id)
    .first<{ password_hash: string; password_salt: string }>();
  if (!row) return c.json(jsonErr("not found"), 404);
  const ok = await verifyPassword(
    body.current_password,
    row.password_hash,
    row.password_salt
  );
  if (!ok) return c.json(jsonErr("current password mismatch"), 401);
  const { hash, salt } = await hashPassword(body.new_password);
  await c.env.DB.prepare(
    "UPDATE admins SET password_hash = ?, password_salt = ? WHERE id = ?"
  )
    .bind(hash, salt, actor.id)
    .run();
  return c.json(jsonOk({ updated: true }));
});

// POST /api/login  (user login by CODE)
authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ code?: string }>().catch(() => ({}));
  const code = body.code?.trim();
  if (!code) return c.json(jsonErr("code is required"), 400);
  const ip = getClientIp(c);

  const row = await c.env.DB.prepare(
    `SELECT id, cf_account_id, login_code, expired_at, is_permanent
       FROM users WHERE login_code = ?`
  )
    .bind(code)
    .first<{
      id: number;
      cf_account_id: number;
      login_code: string;
      expired_at: string | null;
      is_permanent: number;
    }>();
  if (!row) {
    await auditAnon(c.env, ip, "user.login.fail", code, null, "user", null);
    return c.json(jsonErr("invalid code"), 401);
  }
  if (!row.is_permanent && row.expired_at) {
    const exp = new Date(row.expired_at.replace(" ", "T") + "Z").getTime();
    if (exp < Date.now()) {
      await auditAnon(
        c.env,
        ip,
        "user.login.expired",
        code,
        row.cf_account_id,
        "user",
        row.id
      );
      return c.json(jsonErr("code expired"), 401);
    }
  }
  const { token, expiresAt } = await signJwt(
    {
      sub: `user:${row.id}`,
      type: "user",
      id: row.id,
      code: row.login_code,
    },
    c.env.JWT_SECRET,
    USER_TTL
  );
  await auditAnon(
    c.env,
    ip,
    "user.login",
    row.login_code,
    row.cf_account_id,
    "user",
    row.id
  );
  return c.json(
    jsonOk({
      token,
      expires_at: expiresAt,
      actor: { type: "user", id: row.id, login_code: row.login_code },
    })
  );
});

// GET /api/me
authRoutes.get("/me", authMw, async (c) => {
  const actor = c.get("actor");
  if (actor.type === "admin") {
    return c.json(jsonOk({ actor }));
  }
  // hydrate user
  const u = await c.env.DB.prepare(
    `SELECT id, cf_account_id, login_code, note, expired_at, is_permanent, created_at
       FROM users WHERE id = ?`
  )
    .bind(actor.id)
    .first();
  const perms = await c.env.DB.prepare(
    `SELECT can_dns, can_email, can_domain_settings, can_full_access
       FROM permissions WHERE user_id = ?`
  )
    .bind(actor.id)
    .first();
  const domains = await c.env.DB.prepare(
    `SELECT d.id, d.zone_id, d.domain, d.cf_account_id, d.status
       FROM user_domains ud
       JOIN domains d ON d.id = ud.domain_id
      WHERE ud.user_id = ?
      ORDER BY d.domain`
  )
    .bind(actor.id)
    .all();
  return c.json(
    jsonOk({
      actor,
      user: u,
      permissions: perms,
      domains: domains.results ?? [],
    })
  );
});
