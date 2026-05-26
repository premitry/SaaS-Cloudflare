// Cloudflare Domain Management Panel - Worker entry point.
//
// This single Worker serves BOTH:
//   - the dashboard UI (built static files in ../web/dist, via [assets] binding)
//   - the JSON API at /api/*
//
// Routing rules:
//   1. Cloudflare's asset middleware checks for a matching static file first.
//      If the path matches (e.g. /, /assets/foo.js), the asset is served and
//      this Worker never runs.
//   2. If no asset matches, the request falls through to this Worker.
//   3. /api/* and /health are handled by Hono routes below.
//   4. Anything else is treated as a SPA route -> serve index.html so the
//      client-side router can take over.

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

// Health & diag.
app.get("/health", (c) => c.json(jsonOk({ status: "ok" })));

// Diagnostics: confirms binding + env are wired up. Useful for debugging
// "login doesn't work" without exposing any secrets.
app.get("/api/_diag", async (c) => {
  const out: Record<string, unknown> = {
    has_db: !!c.env.DB,
    has_jwt_secret: !!c.env.JWT_SECRET,
    has_assets: !!c.env.ASSETS,
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
      out.db_error = e instanceof Error ? e.message : "unknown db error";
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

// 404 fallback:
//   - /api/*   -> JSON 404
//   - /health  -> JSON 404 (only the exact /health is allowed)
//   - else     -> SPA fallback (serve index.html so the React router can route)
app.notFound(async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname.startsWith("/api/") || url.pathname === "/health") {
    return c.json(jsonErr("not found"), 404);
  }
  if (c.env.ASSETS) {
    // Serve index.html so the client-side router takes over.
    const indexUrl = new URL(url);
    indexUrl.pathname = "/";
    indexUrl.search = "";
    const res = await c.env.ASSETS.fetch(new Request(indexUrl.toString()));
    // Make sure browsers don't aggressively cache the SPA shell.
    const headers = new Headers(res.headers);
    headers.set("Cache-Control", "no-cache, must-revalidate");
    return new Response(res.body, { status: res.status, headers });
  }
  return c.json(jsonErr("not found"), 404);
});

// Error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  const message = err instanceof Error ? err.message : String(err);
  if (/no such table/i.test(message)) {
    return c.json(
      jsonErr(
        "database not initialised: run `npm run db:migrate:remote` (or :local)"
      ),
      500
    );
  }
  return c.json(jsonErr(`internal server error: ${message}`), 500);
});

export default app;
