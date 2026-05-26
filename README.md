# Cloudflare Domain Management Panel

Multi-account, multi-user Cloudflare dashboard with per-domain permissions, DNS management, Email Routing, and audit logging.

> **Single Cloudflare Worker** serves both the dashboard UI **and** the JSON API on the same URL. One `wrangler deploy` and your panel is live at `https://cfp-worker.<your-subdomain>.workers.dev`. No Pages, no Vercel, no separate hosting.

---

## Features

- Admin login (username + password, hashed with PBKDF2-SHA-256)
- User login by **CODE** (1d / 7d / 30d / custom / permanent)
- Connect **multiple Cloudflare accounts** with scoped API tokens
- Domains stay inside the admin's Cloudflare accounts
- Per-user **domain assignment** with checkbox + search
- Permission flags: DNS / Email Routing / Domain Settings / Full Access
- DNS records CRUD with proxy toggle
- Email Routing: enable/disable, catch-all, forward rules
- Domain Settings: SSL mode, Always HTTPS, Cache Purge
- Setup checker (DNS / Email / SSL)
- Audit log for every mutation, with IP
- Session revocation (regenerating a code logs the user out everywhere)
- Dark mode UI inspired by Cloudflare / GitHub / Vercel

---

## Table of Contents

1. [Install (one flow)](#1-install-one-flow)
2. [Requirements](#2-requirements)
3. [What `npm run deploy:setup` does](#3-what-npm-run-deploysetup-does)
4. [First admin login](#4-first-admin-login)
5. [Connect a Cloudflare account](#5-connect-a-cloudflare-account)
6. [Create a user code](#6-create-a-user-code)
7. [Cloudflare API token scopes](#7-cloudflare-api-token-scopes)
8. [Re-deploy after code changes](#8-re-deploy-after-code-changes)
9. [Common commands](#9-common-commands)
10. [Reset / fix things](#10-reset--fix-things)
11. [Local development (optional)](#11-local-development-optional)
12. [Architecture](#12-architecture)
13. [Repository Layout](#13-repository-layout)
14. [Security Model](#14-security-model)
15. [License](#15-license)

---

## 1. Install (one flow)

Everything below runs from your laptop. The end result is a live dashboard at
`https://cfp-worker.<your-subdomain>.workers.dev`.

```bash
git clone https://github.com/premitry/SaaS-Cloudflare.git
cd SaaS-Cloudflare

npx wrangler login          # one-time: opens browser to authorise wrangler
npm run setup               # install deps, create D1, generate JWT, build UI
npm run deploy:setup        # remote migrations + Workers secret + wrangler deploy + bootstrap admin
```

Open the URL printed at the end (e.g. `https://cfp-worker.julianspes.workers.dev`).
The dashboard loads. Click **Admin login** and sign in with the credentials
you just created. Done.

> If you already ran `deploy:setup` once and only want to push new code:
>
> ```bash
> npm run deploy
> ```
>
> That builds the dashboard and runs `wrangler deploy`.

---

## 2. Requirements

| Tool | Min version | Check |
|---|---|---|
| Node.js | 20 | `node --version` |
| npm | 10 | `npm --version` |
| git | any | `git --version` |
| Cloudflare account | free plan OK | <https://dash.cloudflare.com/sign-up> |

You also need at least one domain added to Cloudflare (any plan, free is fine).

If you don't have Node 20+:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20
nvm use 20
```

---

## 3. What `npm run deploy:setup` does

The wizard runs these steps for you, with output showing the underlying
`wrangler` commands at each step:

| Step | Underlying command | Purpose |
|---|---|---|
| 1 | `npx wrangler whoami` | confirm you are logged in |
| 2 | (read `worker/wrangler.toml`) | confirm a real D1 `database_id` is set |
| 3 | `npx wrangler d1 migrations apply cfp_db --remote` | create panel tables in your D1 |
| 4 | `npx wrangler secret put JWT_SECRET` | store a strong random secret on the Worker |
| 5 | `npm --workspace web run build` | build the dashboard into `web/dist/` |
| 6 | **`npx wrangler deploy`** | upload Worker code + `web/dist/` (assets) |
| 7 | `POST /api/admin/bootstrap` | create the first admin (asks you for username + password) |

If any step fails, the wizard tells you which command to run manually.

---

## 4. First admin login

1. Open your worker URL printed by step 6 (e.g. `https://cfp-worker.<sub>.workers.dev`)
2. Click **Admin login** (or go to `/admin/login`)
3. Type a username and a password of at least 8 characters
4. Click **Sign in**

> On an empty database the first credentials you submit become the initial
> admin account. Choose a strong password.

If you skipped the bootstrap during the wizard, you can also do it via curl:

```bash
curl -X POST https://cfp-worker.<sub>.workers.dev/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"a-very-strong-password"}'
```

---

## 5. Connect a Cloudflare account

1. Create a scoped API token at <https://dash.cloudflare.com/profile/api-tokens>
   (see [section 7](#7-cloudflare-api-token-scopes))
2. In the panel, open **Cloudflare Accounts** -> **Connect Account**
3. Paste the token and click **Connect**

The panel verifies the token, captures your account ID, and syncs every zone
into D1. You can connect multiple Cloudflare accounts; each one keeps its own
domains, users, and audit log.

You can also test the token before pasting:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
```

---

## 6. Create a user code

Users authenticate with a CODE, not a password. Each code is tied to one
Cloudflare account and a list of domains.

1. **Users** -> **Add User**
2. Pick a Cloudflare account, set expiry (1d / 7d / 30d / custom / permanent)
3. Tick the **permissions**
4. Tick the **domains** the code may access
5. Click **Create user** -> the generated code (e.g. `SHOP-K82P1`) appears

Share the code. The user logs in at `/login` on your worker URL.

To rotate a user's code (which logs them out instantly), click the refresh
icon on their row.

### Permission cheat sheet

| Permission | What the user can do |
|---|---|
| DNS Access | View, add, edit, delete DNS records, toggle proxy |
| Email Routing | Enable/disable, manage forward rules, manage catch-all |
| Domain Settings | Change SSL mode, Always HTTPS, purge cache |
| Full Domain Access | All of the above + reserved Security tab |

---

## 7. Cloudflare API token scopes

When connecting a Cloudflare account, the token needs:

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

## 8. Re-deploy after code changes

After you edit any file in `worker/src/` or `web/src/`:

```bash
npm run deploy
```

Equivalent to:

```bash
npm --workspace web run build      # rebuild dashboard -> web/dist
npx --workspace worker wrangler deploy
```

The Cloudflare CLI uploads both the Worker code and the static assets in one
shot, then prints the URL.

If you only changed worker code (no UI changes), you can skip the build:

```bash
npm run deploy:worker     # = npx --workspace worker wrangler deploy
```

---

## 9. Common commands

```bash
# install + first-time prep (deps, D1, JWT, migrations, build)
npm run setup

# deploy (production = Cloudflare Workers)
npm run deploy:setup        # one-time guided setup
npm run deploy              # build + wrangler deploy
npm run deploy:worker       # wrangler deploy only

# database
npm run db:create           # alias for `wrangler d1 create cfp_db`
npm run db:migrate:remote   # apply migrations to production D1
npm run db:migrate:local    # apply migrations to local dev D1

# direct wrangler
npx --workspace worker wrangler tail
npx --workspace worker wrangler d1 execute cfp_db --remote \
  --command="SELECT * FROM admins"
npx --workspace worker wrangler secret put JWT_SECRET
npx --workspace worker wrangler secret list
```

---

## 10. Reset / fix things

### I open the URL and see `{"ok":true,"data":{"name":"cfp-worker"...}}` instead of the dashboard

The dashboard wasn't built before the deploy. Fix:

```bash
npm run deploy
```

(That runs `npm run build` then `wrangler deploy`.)

### Forgot the admin password

```bash
npx --workspace worker wrangler d1 execute cfp_db --remote \
  --command="DELETE FROM admins WHERE username='admin';"
```

Then visit `/admin/login` and submit new credentials -> they become the new admin.

### Frontend stuck in unauthorized loop

Open DevTools -> Application -> Local Storage -> remove `cfp_token` and
`cfp_actor`, then refresh.

### Debug what the worker can see (no secrets exposed)

Open `https://<your-worker-url>/api/_diag`. Expected:

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

| Field is `false` | Fix |
|---|---|
| `has_jwt_secret` | `npx --workspace worker wrangler secret put JWT_SECRET` |
| `db_ready` | `npm run db:migrate:remote` |
| `has_assets` | `npm run deploy` (rebuilds + redeploys with the dashboard) |

### `login failed: Pbkdf2 failed: iteration counts above 100000 are not supported`

You're on an old build. Cloudflare Workers caps PBKDF2 at 100,000 iterations.
Pull the latest code and re-deploy:

```bash
git pull origin main
npm run deploy
```

If the error persists, your remote D1 may still have a stale admin row from a
half-failed bootstrap. Wipe it and let the next login create a fresh one:

```bash
npx --workspace worker wrangler d1 execute cfp_db --remote \
  --command="DELETE FROM admins;"
```

Then visit `/admin/login` and submit credentials -> they become the new admin.

### "Cloudflare token invalid" when connecting an account

- Make sure the token has all the scopes in [section 7](#7-cloudflare-api-token-scopes)
- Tokens are case-sensitive, with no leading or trailing whitespace
- Verify the token directly:
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN" \
    https://api.cloudflare.com/client/v4/user/tokens/verify
  ```

### "code expired" on user login

The expiry date passed. Edit the user, change expiry to **Permanent** (or
extend it). Or click the refresh icon to issue a new code.

### Tail production logs

```bash
npx --workspace worker wrangler tail
```

---

## 11. Local development (optional)

You don't need this to use the panel - `npm run deploy` is enough. But if you
want to develop with hot reload before deploying:

```bash
npm run dev
```

This runs two dev servers in parallel:

| Server | URL | Notes |
|---|---|---|
| Vite | <http://localhost:5173> | hot-reload UI; `/api/*` proxied to the worker |
| Wrangler | <http://127.0.0.1:8787> | Worker (API + last built `web/dist`) |

For day-to-day UI work, open <http://localhost:5173>.
Stop both with `Ctrl+C`.

When you're happy, deploy:

```bash
npm run deploy
```

---

## 12. Architecture

```
                  https://cfp-worker.<sub>.workers.dev
                                |
                  +-------------+-------------+
                  |   Cloudflare Worker       |
                  |                           |
   /              | -> [assets] binding ----> | -> web/dist (React SPA)
   /assets/*.js   |                           |
   /api/*         | -> Hono routes ---------> | -> D1 (cfp_db)
   /health        |                           |
   /domains/...   | -> SPA fallback --------> | -> index.html (client routing)
                  +---------------------------+
```

- **One Worker. One URL. One `wrangler deploy`.**
- Frontend is a static Vite + React SPA, built once into `web/dist/` and
  served via the Worker's `[assets]` binding.
- The same Worker handles `/api/*` against a D1 database.
- Client-side React Router takes care of `/dashboard`, `/domains/42`, etc.
  through SPA fallback in the Worker's `notFound` handler.

---

## 13. Repository Layout

```
SaaS-Cloudflare/
├── worker/              # Cloudflare Workers backend
│   ├── src/
│   │   ├── index.ts            # entrypoint: API routes + SPA fallback
│   │   ├── auth.ts             # PBKDF2 + JWT
│   │   ├── middleware.ts       # CORS, auth, permissions
│   │   ├── cloudflare.ts       # CF API client
│   │   ├── audit.ts            # audit log writer
│   │   └── routes/             # auth, cf-accounts, users, domains,
│   │                           #   dns, email-routing, settings, audit-logs
│   ├── migrations/0001_init.sql
│   └── wrangler.toml           # also configures [assets] = ../web/dist
├── web/                 # Vite + React + React Router (static SPA)
│   ├── index.html
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx            # BrowserRouter + ToastProvider
│       ├── App.tsx             # Routes
│       ├── pages/              # Login, AdminLogin, Dashboard,
│       │                       #   CloudflareAccounts, Users, AuditLogs,
│       │                       #   SettingsPage, Domains, DomainLayout,
│       │                       #   DomainOverview, DomainDNS,
│       │                       #   DomainEmailRouting, DomainSettingsPage,
│       │                       #   DomainSecurity
│       ├── components/         # Sidebar, Modal, Toggle, CopyButton,
│       │                       #   Toast, Icon, Spinner
│       └── lib/                # api.ts, format.ts
├── scripts/
│   ├── setup.mjs               # one-shot local install
│   ├── dev.mjs                 # parallel worker + vite (optional)
│   └── deploy.mjs              # guided production deploy
└── README.md
```

---

## 14. Security Model

- Passwords hashed with **PBKDF2-SHA-256** (100,000 iterations - the max
  Cloudflare Workers allows) via Web Crypto
- Sessions are signed JWTs (HS256) using `JWT_SECRET` (random per install)
- User JWT is bound to `login_code` -> regenerating a code instantly
  invalidates all old tokens
- The frontend never sees Cloudflare API tokens or password hashes
- Per-request authorization checks domain ownership AND permission flags
- Every mutation is written to `audit_logs` with actor, action, target, and IP

---

## 15. License

MIT
