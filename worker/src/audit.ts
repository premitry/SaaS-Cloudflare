// Audit logging helpers.

import type { Context } from "hono";
import type { Env, Variables } from "./types";
import { getClientIp } from "./util";

type Ctx = Context<{ Bindings: Env; Variables: Variables }>;

export async function audit(
  c: Ctx,
  action: string,
  target: string | null = null,
  cfAccountId: number | null = null
): Promise<void> {
  const actor = c.get("actor");
  const ip = getClientIp(c);
  await c.env.DB.prepare(
    `INSERT INTO audit_logs (cf_account_id, user_id, actor_type, action, target, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(
      cfAccountId,
      actor?.type === "user" ? actor.id : null,
      actor?.type ?? "system",
      action,
      target,
      ip
    )
    .run();
}

// Used at login (no actor yet)
export async function auditAnon(
  env: Env,
  ip: string | null,
  action: string,
  target: string | null,
  cfAccountId: number | null,
  actorType: "admin" | "user" | "system",
  userId: number | null
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (cf_account_id, user_id, actor_type, action, target, ip_address)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(cfAccountId, userId, actorType, action, target, ip)
    .run();
}
