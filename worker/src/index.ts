// Cloudflare Domain Management Panel - Worker entry point.

import { Hono } from "hono";
import type { Env, Variables } from "./types";
import { corsMw } from "./middleware";
import { jsonErr, jsonOk } from "./util";

import { authRoutes } from "./routes/auth";
import { cfAccountsRoutes } from "./routes/cf-accounts";
import { usersRoutes } from "./routes/users";
import { domainsRoutes } from "./routes/domains";
import { dnsRoutes } from "./routes/dns";
import { emailRoutes } from "./routes/email-routing";
import { settingsRoutes } from "./routes/settings";
import { auditRoutes } from "./routes/audit-logs";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use("*", corsMw);

// Health & root
app.get("/", (c) => c.json(jsonOk({ name: "cfp-worker", version: "0.1.0" })));
app.get("/health", (c) => c.json(jsonOk({ status: "ok" })));

// Diagnostics: confirms binding + env are wired up. Useful for debugging
// "login doesn't work" without exposing any secrets.
app.get("/api/_diag", async (c) => {
  const out: Record<string, unknown> = {
    has_db: !!c.env.DB,
    has_jwt_secret: !!c.env.JWT_SECRET,
    allowed_origins: c.env.ALLOWED_ORIGINS ?? "(default *)",
  };
  if (c.env.DB) {
    try {
      const r = await c.env.DB.prepare(
        "SELECT COUNT(*) AS n FROM admins"
      ).first<{ n: number | bigint | string }>();
      out.admin_count =
        typeof r?.n === "number" ? r.n : Number(r?.n ?? 0);
      out.db_ready = true;
    } catch (e) {
      out.db_ready = false;
      out.db_error =
        e instanceof Error ? e.message : "unknown db error";
    }
  }
  return c.json(jsonOk(out));
});

// Auth (admin login, user login, bootstrap, /me)
app.route("/api", authRoutes);

// Admin-only: CF accounts, users, audit logs
app.route("/api/cf-accounts", cfAccountsRoutes);
app.route("/api/users", usersRoutes);
app.route("/api/audit-logs", auditRoutes);

// Per-domain endpoints (DNS, Email Routing, Settings) all live under /api/domains
app.route("/api/domains", domainsRoutes);
app.route("/api/domains", dnsRoutes);
app.route("/api/domains", emailRoutes);
app.route("/api/domains", settingsRoutes);

// 404 fallback
app.notFound((c) => c.json(jsonErr("not found"), 404));

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  const message = err instanceof Error ? err.message : String(err);
  // give helpful hints for common setup mistakes
  if (/no such table/i.test(message)) {
    return c.json(
      jsonErr(
        "database not initialised: run `npm run db:migrate:local` (or :remote)"
      ),
      500
    );
  }
  return c.json(jsonErr(`internal server error: ${message}`), 500);
});

export default app;
