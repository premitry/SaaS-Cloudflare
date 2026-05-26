# Cloudflare Domain Management Panel

A SaaS-style dashboard for managing Cloudflare zones across **multiple Cloudflare accounts** and **multiple users**, with granular per-domain permissions, DNS management, Email Routing, and audit logging.

> **Single Cloudflare Worker** serves both the dashboard UI (Vite + React) and the JSON API (Hono + D1). One `wrangler deploy` and your panel is live at `https://cfp-worker.<your-subdomain>.workers.dev`.

---

## Features

- Admin login (username + password, hashed with PBKDF2-SHA-256)
- User login by **CODE** (temporary 1d / 7d / 30d / custom or permanent)
- Connect **multiple Cloudflare accounts** with scoped API tokens
- Domains stay inside the admin's Cloudflare accounts
- Per-user **domain assignment** with checkbox + search
- Permission flags: DNS / Email Routing / Domain Settings / Full Access
- DNS records CRUD with proxy toggle
- Email Routing: enable/disable, catch-all, forward rules, destinations
- Domain Settings: SSL mode, Always HTTPS, Cache Purge
- Setup checker (DNS / Email / SSL)
- Audit logs (every mutation, with IP)
- Session revocation (regenerating a code logs the user out everywhere)
- Dark mode UI inspired by Cloudflare / GitHub / Vercel

---

## Table of Contents

1. [Quick Start](#1-quick-start)
2. [Requirements](#2-requirements)
3. [Architecture](#3-architecture)
4. [Local development](#4-local-development)
5. [Deploy to Cloudflare](#5-deploy-to-cloudflare)
6. [First admin login](#6-first-admin-login)
7. [Connect a Cloudflare account](#7-connect-a-cloudflare-account)
8. [Create a user code](#8-create-a-user-code)
9. [Cloudflare API token scopes](#9-cloudflare-api-token-scopes)
10. [Common commands](#10-common-commands)
11. [Reset / fix things](#11-reset--fix-things)
12. [Repository Layout](#12-repository-layout)
13. [Security Model](#13-security-model)
14. [License](#14-license)

---

## 1. Quick Start

```bash
git clone https://github.com/premitry/SaaS-Cloudflare.git
cd SaaS-Cloudflare

npx wrangler login          # one-time
npm run setup               # install + D1 + JWT + migrations + build dashboard
npm run deploy:setup        # remote migrations + secret + wrangler deploy + admin
```

Open `https://cfp-worker.<your-subdomain>.workers.dev`. The dashboard loads.
Click **Admin login**, sign in with the credentials you created during
`deploy:setup`. Done.

For local development before deploying, see [section 4](#4-local-development).

---

## 2. Requirements

| Tool | Min version | Check command |
|---|---|---|
| Node.js | 20 | `node --version` |
| npm | 10 | `npm --version` |
| git | any | `git --version` |
| Cloudflare account | free plan OK | <https://dash.cloudflare.com/sign-up> |

You also need at least one domain added to Cloudflare (any plan, free is fine).

If you don't have Node 20+, install via nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20
nvm use 20
```

---

## 3. Architecture

```
                  https://cfp-worker.<sub>.workers.dev
                                |
                  +-------------+-------------+
                  |   Cloudflare Worker       |
                  |                           |
   /              | -> [assets] binding ----> | -> web/dist (React SPA)
   /assets/*.js   |                           |
   /favicon.ico   |                           |
   /api/*         | -> Hono routes ---------> | -> D1 (cfp_db)
   /health        |                           |
   /domains/...   | -> SPA fallback --------> | -> index.html (client routing)
                  +---------------------------+
```

- **One Worker. One URL. One deploy.**
- The frontend is a static Vite + React SPA, built once and served via the
  Worker's `[assets]` binding.
- The same Worker handles `/api/*` against a D1 database.
- Client-side React Router takes care of `/dashboard`, `/domains/42`, etc.
  through SPA fallback in the Worker's `notFound` handler.

---

## 4. Local development

```bash
npm run dev
```

This starts two dev servers in parallel:

| Server | URL | Notes |
|---|---|---|
| Vite | <http://localhost:5173> | hot-reload UI; `/api/*` proxied to the worker |
| Wrangler | <http://127.0.0.1:8787> | the Worker (API + already-built `web/dist`) |

For day-to-day UI work, open <http://localhost:5173>.
To exercise the production-like single-URL setup, open <http://127.0.0.1:8787>
(remember to `npm run build` after UI changes if you use this URL).

Stop both with `Ctrl+C`.

---

## 5. Deploy to Cloudflare

### 5.1 First time: `npm run deploy:setup`

```bash
npx wrangler login          # if you haven't already
npm run deploy:setup
```

What the script does:

| Step | What happens |
|---|---|
| 1 | `wrangler whoami` |
| 2 | Verifies `worker/wrangler.toml` has a real D1 `database_id` |
| 3 | `wrangler d1 migrations apply cfp_db --remote` |
| 4 | Generates a strong random `JWT_SECRET` and stores it as a Workers secret |
| 5 | `npm run build` (Vite -> `web/dist`) |
| 6 | `wrangler deploy` (uploads worker code + `web/dist` as `[assets]`) |
| 7 | `POST /api/admin/bootstrap` to create the first admin |

When it finishes you have one URL like
`https://cfp-worker.<subdomain>.workers.dev`. Open it -> you see the dashboard.

### 5.2 Re-deploy after code changes

```bash
npm run deploy              # = npm run build && wrangler deploy
```

Or if only the worker code changed (no UI changes):

```bash
npm run deploy:worker       # alias of `wrangler deploy`
```

### 5.3 Manual deploy (no wizard)

```bash
# 1. (one-time) JWT_SECRET as a Workers secret
cd worker
npx wrangler secret put JWT_SECRET
cd ..

# 2. (one-time) remote migrations
npm run db:migrate:remote

# 3. build dashboard + deploy
npm run build
cd worker
npx wrangler deploy
```

You will see the worker URL printed at the end of `wrangler deploy`.

### 5.4 Bootstrap admin if you skipped the wizard

```bash
curl -X POST https://cfp-worker.<sub>.workers.dev/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"a-very-strong-password"}'
```

---

## 6. First admin login

1. Open your worker URL (e.g. `https://cfp-worker.<sub>.workers.dev`)
2. Click **Admin login** (or go to `/admin/login`)
3. Type a username and a password of at least 8 characters
4. Click **Sign in**

> On an empty database the first credentials you submit become the initial
> admin account. Choose a strong password.

---

## 7. Connect a Cloudflare account

1. Create a scoped API token at <https://dash.cloudflare.com/profile/api-tokens>
   (see [section 9](#9-cloudflare-api-token-scopes))
2. In the panel, open **Cloudflare Accounts** -> **Connect Account**
3. Paste the token and click **Connect**

The panel verifies the token, captures your account ID, and syncs every zone
into the local database.

You can also test the token quickly:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
```

> **Tip:** You can connect multiple Cloudflare accounts. Each one keeps its own
> domains, users, and audit log.

---

## 8. Create a user code

In the panel:

1. **Users** -> **Add User**
2. Pick a Cloudflare account, set expiry (1d / 7d / 30d / custom / permanent)
3. Tick the **permissions** (DNS / Email Routing / Domain Settings / Full Access)
4. Tick the **domains** the code may access
5. Click **Create user** -> the generated code (e.g. `SHOP-K82P1`) appears

Share the code with your user. They log in at `/login`.

To rotate a user's code (which logs them out instantly): click the refresh
icon on their row.

### Permission cheat sheet

| Permission | What the user can do |
|---|---|
| DNS Access | View, add, edit, delete DNS records, toggle proxy |
| Email Routing | Enable/disable, manage forward rules, manage catch-all |
| Domain Settings | Change SSL mode, Always HTTPS, purge cache |
| Full Domain Access | All of the above + reserved Security tab |

---

## 9. Cloudflare API token scopes

When connecting a Cloudflare account, the token must have:

| Resource | Permission |
|---|---|
| Zone -> Zone | Read |
| Zone -> DNS | Edit |
| Zone -> Email Routing Rules | Edit |
| Zone -> Email Routing Addresses | Edit |
| Zone -> Zone Settings | Edit |
| Zone -> Cache Purge | Purge |
| Account -> Email Routing Addresses | Edit |

Zone Resources: **All zones** (or specific ones).
Account Resources: **your account** (needed for email destinations).

The token is stored in D1 and is **never** returned to the frontend.

---

## 10. Common commands

```bash
# install + first-time local setup
npm run setup

# dev (worker on 8787 + vite UI on 5173, hot reload)
npm run dev
npm run dev:worker          # worker only
npm run dev:web             # vite only

# build dashboard for production
npm run build

# database
npm run db:create           # alias for `wrangler d1 create cfp_db`
npm run db:migrate:local
npm run db:migrate:remote

# deploy
npm run deploy:setup        # guided one-time prod setup (secret + admin + deploy)
npm run deploy              # build + wrangler deploy
npm run deploy:worker       # wrangler deploy only (no rebuild)

# direct wrangler
npx --workspace worker wrangler tail
npx --workspace worker wrangler d1 execute cfp_db --remote --command="SELECT * FROM admins"
npx --workspace worker wrangler secret put JWT_SECRET
npx --workspace worker wrangler secret list
```

---

## 11. Reset / fix things

### I open the worker URL and see `{"ok":true,"data":{"name":"cfp-worker"...}}` instead of the dashboard

That means the dashboard wasn't built before the deploy. Fix:

```bash
npm run build
cd worker
npx wrangler deploy
```

### Forgot the admin password (production)

```bash
npx --workspace worker wrangler d1 execute cfp_db --remote \
  --command="DELETE FROM admins WHERE username='admin';"
```

Then visit `/admin/login` and submit new credentials -> they become the new admin.

### Forgot the admin password (local)

```bash
npx --workspace worker wrangler d1 execute cfp_db --local \
  --command="DELETE FROM admins WHERE username='admin';"
```

### Wipe local DB and start over

```bash
rm -rf worker/.wrangler
npm run db:migrate:local
```

### Frontend stuck in unauthorized loop

DevTools -> Application -> Local Storage -> remove `cfp_token` and `cfp_actor`,
then refresh.

### Debug what the worker can see (no secrets exposed)

Open `https://<your-worker-url>/api/_diag`. Expected shape:

```json
{
  "ok": true,
  "data": {
    "has_db": true,
    "has_jwt_secret": true,
    "has_assets": true,
    "db_ready": true,
    "admin_count": 1
  }
}
```

If `has_jwt_secret: false`, run `npx wrangler secret put JWT_SECRET` (production)
or rerun `npm run setup` (local).
If `db_ready: false`, run `npm run db:migrate:remote` (or `:local`).
If `has_assets: false`, the dashboard hasn't been built/uploaded yet:
`npm run build && npm run deploy:worker`.

### Tail production logs

```bash
npx --workspace worker wrangler tail
```

---

## 12. Repository Layout

```
SaaS-Cloudflare/
├── worker/              # Cloudflare Workers backend (Hono + D1)
│   ├── src/
│   │   ├── index.ts            # entrypoint: API routes + SPA fallback
│   │   ├── auth.ts             # PBKDF2 + JWT
│   │   ├── middleware.ts       # CORS, auth, permissions
│   │   ├── cloudflare.ts       # CF API client
│   │   ├── audit.ts            # audit log writer
│   │   └── routes/             # auth, cf-accounts, users, domains, dns,
│   │                           #   email-routing, settings, audit-logs
│   ├── migrations/0001_init.sql
│   └── wrangler.toml           # also configures [assets] = ../web/dist
├── web/                 # Vite + React + React Router (static SPA)
│   ├── index.html
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx            # BrowserRouter + ToastProvider
│   │   ├── App.tsx             # Routes
│   │   ├── pages/              # Login, AdminLogin, Dashboard,
│   │   │                       #   CloudflareAccounts, Users, AuditLogs,
│   │   │                       #   SettingsPage, Domains,
│   │   │                       #   DomainLayout / DomainOverview /
│   │   │                       #   DomainDNS / DomainEmailRouting /
│   │   │                       #   DomainSettingsPage / DomainSecurity
│   │   ├── components/         # Sidebar, Modal, Toggle, CopyButton, Toast, Icon, Spinner
│   │   ├── lib/api.ts          # typed fetch client + auth storage
│   │   └── lib/format.ts
│   └── dist/                   # build output (served by worker [assets])
├── scripts/
│   ├── setup.mjs               # one-shot local install
│   ├── dev.mjs                 # parallel worker + vite
│   └── deploy.mjs              # guided production deploy
└── README.md
```

---

## 13. Security Model

- Passwords hashed with **PBKDF2-SHA-256** (210,000 iterations) via Web Crypto
- Sessions are signed JWTs (HS256) using `JWT_SECRET` (random per install)
- User JWT is bound to `login_code` -> regenerating a code instantly invalidates all old tokens
- The frontend never sees Cloudflare API tokens or password hashes
- Per-request authorization checks domain ownership AND permission flags
- Every mutation is written to `audit_logs` with actor, action, target, and IP

### What the user cannot do

- See other users' domains
- See API tokens or password hashes
- Remove a domain from Cloudflare or disconnect an account
- Create more users
- View the audit log

---

## 14. License

MIT
