// User management (admin only).

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { adminOnly, authMw } from "../middleware";
import { audit } from "../audit";
import {
  addDaysIso,
  generateLoginCode,
  jsonErr,
  jsonOk,
  safePrefix,
} from "../util";

export const usersRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

usersRoutes.use("*", authMw, adminOnly);

// GET /api/users?cf_account_id=&q=
usersRoutes.get("/", async (c) => {
  const cfId = c.req.query("cf_account_id");
  const q = c.req.query("q");

  let sql = `
    SELECT u.id, u.cf_account_id, u.login_code, u.note, u.role,
           u.expired_at, u.is_permanent, u.created_at,
           (SELECT COUNT(*) FROM user_domains ud WHERE ud.user_id = u.id) AS domain_count
      FROM users u
     WHERE 1=1
  `;
  const args: unknown[] = [];
  if (cfId) {
    sql += " AND u.cf_account_id = ?";
    args.push(Number(cfId));
  }
  if (q) {
    sql += `
      AND (
        u.login_code LIKE ?
        OR COALESCE(u.note,'') LIKE ?
        OR EXISTS (
          SELECT 1 FROM user_domains ud
          JOIN domains d ON d.id = ud.domain_id
          WHERE ud.user_id = u.id AND d.domain LIKE ?
        )
      )
    `;
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  sql += " ORDER BY u.id DESC";

  const rows = await c.env.DB.prepare(sql)
    .bind(...args)
    .all<{
      id: number;
      cf_account_id: number;
      login_code: string;
      note: string | null;
      role: string;
      expired_at: string | null;
      is_permanent: number;
      created_at: string;
      domain_count: number;
    }>();

  // attach permissions and status
  const out = await Promise.all(
    (rows.results ?? []).map(async (u) => {
      const p = await c.env.DB.prepare(
        `SELECT can_dns, can_email, can_domain_settings, can_full_access
           FROM permissions WHERE user_id = ?`
      )
        .bind(u.id)
        .first();
      const status =
        !u.is_permanent &&
        u.expired_at &&
        new Date(u.expired_at.replace(" ", "T") + "Z").getTime() < Date.now()
          ? "expired"
          : "active";
      return { ...u, permissions: p ?? null, status };
    })
  );
  return c.json(jsonOk(out));
});

// GET /api/users/:id  (full detail with domains + permissions)
usersRoutes.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const u = await c.env.DB.prepare(
    `SELECT id, cf_account_id, login_code, note, role, expired_at, is_permanent, created_at
       FROM users WHERE id = ?`
  )
    .bind(id)
    .first();
  if (!u) return c.json(jsonErr("not found"), 404);
  const p = await c.env.DB.prepare(
    `SELECT can_dns, can_email, can_domain_settings, can_full_access
       FROM permissions WHERE user_id = ?`
  )
    .bind(id)
    .first();
  const ds = await c.env.DB.prepare(
    `SELECT d.id, d.zone_id, d.domain, d.cf_account_id, d.status
       FROM user_domains ud
       JOIN domains d ON d.id = ud.domain_id
      WHERE ud.user_id = ?
      ORDER BY d.domain`
  )
    .bind(id)
    .all();
  return c.json(
    jsonOk({ user: u, permissions: p, domains: ds.results ?? [] })
  );
});

type CreateUserBody = {
  cf_account_id: number;
  note?: string;
  domain_ids?: number[];
  permissions?: {
    can_dns?: boolean;
    can_email?: boolean;
    can_domain_settings?: boolean;
    can_full_access?: boolean;
  };
  expired_at?: string | null;
  is_permanent?: boolean;
  duration_days?: number; // shorthand for temporary codes
  code_prefix?: string;
  login_code?: string; // optional manual code
};

// POST /api/users  -- create user (and assign domains, permissions)
usersRoutes.post("/", async (c) => {
  const body = await c.req.json<CreateUserBody>().catch(() => ({}) as CreateUserBody);
  if (!body.cf_account_id) {
    return c.json(jsonErr("cf_account_id is required"), 400);
  }
  // validate cf_account
  const acct = await c.env.DB.prepare(
    "SELECT id FROM cf_accounts WHERE id = ?"
  )
    .bind(body.cf_account_id)
    .first();
  if (!acct) return c.json(jsonErr("cf_account not found"), 400);

  const code = body.login_code?.trim() || generateLoginCode(safePrefix(body.code_prefix));

  const isPermanent = !!body.is_permanent;
  let expiredAt: string | null = null;
  if (!isPermanent) {
    if (body.expired_at) {
      expiredAt = body.expired_at;
    } else if (body.duration_days && body.duration_days > 0) {
      expiredAt = addDaysIso(body.duration_days);
    } else {
      expiredAt = addDaysIso(7); // default
    }
  }

  const ins = await c.env.DB.prepare(
    `INSERT INTO users (cf_account_id, login_code, note, role, expired_at, is_permanent)
     VALUES (?, ?, ?, 'user', ?, ?)`
  )
    .bind(body.cf_account_id, code, body.note ?? null, expiredAt, isPermanent ? 1 : 0)
    .run();
  const id = Number(ins.meta.last_row_id);

  // permissions
  const perm = body.permissions ?? {};
  const fullAccess = !!perm.can_full_access;
  await c.env.DB.prepare(
    `INSERT INTO permissions (user_id, can_dns, can_email, can_domain_settings, can_full_access)
     VALUES (?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      fullAccess || perm.can_dns ? 1 : 0,
      fullAccess || perm.can_email ? 1 : 0,
      fullAccess || perm.can_domain_settings ? 1 : 0,
      fullAccess ? 1 : 0
    )
    .run();

  // domain assignment - filter to ones inside this cf_account
  if (body.domain_ids?.length) {
    const placeholders = body.domain_ids.map(() => "?").join(",");
    const valid = await c.env.DB.prepare(
      `SELECT id FROM domains WHERE cf_account_id = ? AND id IN (${placeholders})`
    )
      .bind(body.cf_account_id, ...body.domain_ids)
      .all<{ id: number }>();
    for (const d of valid.results ?? []) {
      await c.env.DB.prepare(
        "INSERT OR IGNORE INTO user_domains (user_id, domain_id) VALUES (?, ?)"
      )
        .bind(id, d.id)
        .run();
    }
  }

  await audit(c, "user.create", code, body.cf_account_id);
  return c.json(jsonOk({ id, login_code: code, expired_at: expiredAt, is_permanent: isPermanent }));
});

type UpdateUserBody = Partial<CreateUserBody> & { regenerate_code?: boolean };

// PATCH /api/users/:id
usersRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const body = await c.req.json<UpdateUserBody>().catch(() => ({}) as UpdateUserBody);
  const cur = await c.env.DB.prepare(
    "SELECT id, cf_account_id, login_code FROM users WHERE id = ?"
  )
    .bind(id)
    .first<{ id: number; cf_account_id: number; login_code: string }>();
  if (!cur) return c.json(jsonErr("not found"), 404);

  const sets: string[] = [];
  const args: unknown[] = [];
  if (body.note !== undefined) {
    sets.push("note = ?");
    args.push(body.note);
  }
  if (body.is_permanent !== undefined) {
    sets.push("is_permanent = ?");
    args.push(body.is_permanent ? 1 : 0);
    if (body.is_permanent) {
      sets.push("expired_at = NULL");
    }
  }
  if (body.expired_at !== undefined && !body.is_permanent) {
    sets.push("expired_at = ?");
    args.push(body.expired_at);
  } else if (body.duration_days && !body.is_permanent) {
    sets.push("expired_at = ?");
    args.push(addDaysIso(body.duration_days));
  }
  if (body.regenerate_code) {
    const newCode = generateLoginCode(safePrefix(body.code_prefix));
    sets.push("login_code = ?");
    args.push(newCode);
  }
  if (sets.length) {
    args.push(id);
    await c.env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`)
      .bind(...args)
      .run();
  }

  // permissions
  if (body.permissions) {
    const p = body.permissions;
    const full = !!p.can_full_access;
    await c.env.DB.prepare(
      `INSERT INTO permissions (user_id, can_dns, can_email, can_domain_settings, can_full_access)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           can_dns = excluded.can_dns,
           can_email = excluded.can_email,
           can_domain_settings = excluded.can_domain_settings,
           can_full_access = excluded.can_full_access`
    )
      .bind(
        id,
        full || p.can_dns ? 1 : 0,
        full || p.can_email ? 1 : 0,
        full || p.can_domain_settings ? 1 : 0,
        full ? 1 : 0
      )
      .run();
  }

  // domains
  if (body.domain_ids) {
    await c.env.DB.prepare("DELETE FROM user_domains WHERE user_id = ?")
      .bind(id)
      .run();
    if (body.domain_ids.length) {
      const placeholders = body.domain_ids.map(() => "?").join(",");
      const valid = await c.env.DB.prepare(
        `SELECT id FROM domains WHERE cf_account_id = ? AND id IN (${placeholders})`
      )
        .bind(cur.cf_account_id, ...body.domain_ids)
        .all<{ id: number }>();
      for (const d of valid.results ?? []) {
        await c.env.DB.prepare(
          "INSERT OR IGNORE INTO user_domains (user_id, domain_id) VALUES (?, ?)"
        )
          .bind(id, d.id)
          .run();
      }
    }
  }

  await audit(c, "user.update", cur.login_code, cur.cf_account_id);
  // return updated
  const updated = await c.env.DB.prepare(
    "SELECT id, login_code, expired_at, is_permanent FROM users WHERE id = ?"
  )
    .bind(id)
    .first();
  return c.json(jsonOk(updated));
});

// DELETE /api/users/:id
usersRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const cur = await c.env.DB.prepare(
    "SELECT login_code, cf_account_id FROM users WHERE id = ?"
  )
    .bind(id)
    .first<{ login_code: string; cf_account_id: number }>();
  if (!cur) return c.json(jsonErr("not found"), 404);
  await c.env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id).run();
  await audit(c, "user.delete", cur.login_code, cur.cf_account_id);
  return c.json(jsonOk({ deleted: true }));
});
