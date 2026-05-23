// Audit log listing (admin only).

import { Hono } from "hono";
import type { Env, Variables } from "../types";
import { adminOnly, authMw } from "../middleware";
import { jsonOk } from "../util";

export const auditRoutes = new Hono<{ Bindings: Env; Variables: Variables }>();

auditRoutes.use("*", authMw, adminOnly);

// GET /api/audit-logs?cf_account_id=&user_id=&action=&q=&limit=&offset=
auditRoutes.get("/", async (c) => {
  const cfId = c.req.query("cf_account_id");
  const userId = c.req.query("user_id");
  const action = c.req.query("action");
  const q = c.req.query("q");
  const limit = Math.min(Number(c.req.query("limit") ?? 100), 500);
  const offset = Number(c.req.query("offset") ?? 0);

  let sql = `
    SELECT a.id, a.cf_account_id, a.user_id, a.actor_type, a.action, a.target,
           a.ip_address, a.created_at,
           u.login_code AS user_code,
           ca.name AS cf_account_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.user_id
      LEFT JOIN cf_accounts ca ON ca.id = a.cf_account_id
     WHERE 1=1
  `;
  const args: unknown[] = [];
  if (cfId) {
    sql += " AND a.cf_account_id = ?";
    args.push(Number(cfId));
  }
  if (userId) {
    sql += " AND a.user_id = ?";
    args.push(Number(userId));
  }
  if (action) {
    sql += " AND a.action LIKE ?";
    args.push(`%${action}%`);
  }
  if (q) {
    sql += " AND (a.target LIKE ? OR a.action LIKE ? OR a.ip_address LIKE ?)";
    const like = `%${q}%`;
    args.push(like, like, like);
  }
  sql += " ORDER BY a.id DESC LIMIT ? OFFSET ?";
  args.push(limit, offset);

  const rows = await c.env.DB.prepare(sql)
    .bind(...args)
    .all();
  return c.json(jsonOk(rows.results ?? []));
});
