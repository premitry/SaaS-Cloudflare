# Cloudflare Domain Management Panel

A SaaS-style dashboard for managing Cloudflare zones across **multiple Cloudflare accounts** and **multiple users**, with granular per-domain permissions, DNS management, Email Routing, and audit logging.

> Backend: Cloudflare Workers + D1   Frontend: Next.js + Tailwind (Dark Mode)   Auth: JWT.

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

1. [Quick Start (3 commands)](#1-quick-start-3-commands)
2. [Requirements](#2-requirements)
3. [Install](#3-install)
4. [Run](#4-run)
5. [First admin login](#5-first-admin-login)
6. [Get a Cloudflare API token](#6-get-a-cloudflare-api-token)
7. [Connect your Cloudflare account](#7-connect-your-cloudflare-account)
8. [Create a user code](#8-create-a-user-code)
9. [Use the panel as a user](#9-use-the-panel-as-a-user)
10. [Email Routing](#10-email-routing)
11. [Domain Settings & Cache Purge](#11-domain-settings--cache-purge)
12. [Audit log](#12-audit-log)
13. [Deploy to production](#13-deploy-to-production)
14. [Common commands](#14-common-commands)
15. [Manual install (if `npm run setup` fails)](#15-manual-install-if-npm-run-setup-fails)
16. [Reset / fix things](#16-reset--fix-things)
17. [Repository Layout](#17-repository-layout)
18. [Security Model](#18-security-model)
19. [License](#19-license)

---

## 1. Quick Start (3 commands)

```bash
git clone https://github.com/premitry/SaaS-Cloudflare.git
cd SaaS-Cloudflare
npm run setup     # installs deps, generates secrets, creates D1, runs migrations
npm run dev       # starts worker (8787) + web (3000) together
```

Open <http://localhost:3000>, click **Admin login**, and submit any
username + password (>= 8 chars). On a fresh database the first credentials
you submit become the initial admin.

When you are ready to ship, one more command does the production deploy
(secret + CORS + remote migrate + worker deploy + admin bootstrap):

```bash
npx wrangler login        # one-time, if you haven't already
npm run deploy:setup      # guided production deploy
```

See [section 13](#13-deploy-to-production) for details.

---

## 2. Requirements

| Tool | Min version | Check command |
|---|---|---|
| Node.js | 20 | `node --version` |
| npm | 10 | `npm --version` |
| git | any | `git --version` |
| Cloudflare account | free plan OK | <https://dash.cloudflare.com/sign-up> |

You also need at least one domain added to Cloudflare (any plan, free is fine).

If you don't have Node 20+, install it from <https://nodejs.org> or via nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20
nvm use 20
```

---

## 3. Install

### 3.1 Clone the repo

```bash
git clone https://github.com/premitry/SaaS-Cloudflare.git
cd SaaS-Cloudflare
```

### 3.2 Log in to the Cloudflare CLI (one-time)

This opens your browser so the wrangler CLI can talk to your account.
Required only the first time, and only if you want the setup script to create
the D1 database for you.

```bash
npx wrangler login
```

Verify:

```bash
npx wrangler whoami
```

Expected output:

```
You are logged in with the OAuth Token, associated with the email you@example.com
Your account ID: abcd1234ef5678...
```

### 3.3 Run the setup wizard

```bash
npm run setup
```

When prompted **"Create a new D1 database now? (y/N)"** type **`y`** and press Enter.

What the wizard does:

| Step | What happens |
|---|---|
| 1 | Verifies Node 20+ |
| 2 | Runs `npm install` if needed |
| 3 | Creates `worker/wrangler.toml` from the example |
| 4 | Generates a random `JWT_SECRET` and writes it to `worker/.dev.vars` |
| 5 | Creates `web/.env.local` from the example |
| 6 | Runs `npx wrangler d1 create cfp_db` |
| 7 | Writes the database id into `worker/wrangler.toml` automatically |
| 8 | Applies all migrations to your local D1 |

The wizard is **idempotent** - it is safe to re-run at any time. It will not
overwrite files that already exist.

---

## 4. Run

```bash
npm run dev
```

You will see two prefixed log streams:

```
[worker] Ready on http://127.0.0.1:8787
[web   ] - Local:  http://localhost:3000
```

Leave it running. Stop both servers with `Ctrl+C`.

If you only want one of them:

```bash
npm run dev:worker     # only the API on :8787
npm run dev:web        # only the dashboard on :3000
```

---

## 5. First admin login

1. Open <http://localhost:3000>
2. Click **Admin login** (or go to `/admin/login`)
3. Type a username (e.g. `admin`) and a password of at least 8 characters
4. Click **Sign in**

> On an empty database, the first credentials you submit become the initial
> admin account. Choose a strong password.

You should land on the dashboard:

```
Dashboard
  Cloudflare Accounts: 0
  Domains: 0
  Users: 0
  Audit Events: 1   <- your login was recorded
```

You can also bootstrap via curl (useful for headless setups):

```bash
curl -X POST http://127.0.0.1:8787/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourStrongPassword!"}'
```

---

## 6. Get a Cloudflare API token

1. Open <https://dash.cloudflare.com/profile/api-tokens>
2. Click **Create Token**
3. Choose **Create Custom Token**
4. Give it a name (e.g. `panel-token`)
5. Add the following permissions (click **+ Add more** between rows):

   | Resource | Permission |
   |---|---|
   | Zone -> Zone | Read |
   | Zone -> DNS | Edit |
   | Zone -> Email Routing Rules | Edit |
   | Zone -> Email Routing Addresses | Edit |
   | Zone -> Zone Settings | Edit |
   | Zone -> Cache Purge | Purge |
   | Account -> Email Routing Addresses | Edit |

6. **Zone Resources** -> Include -> All zones (or specific zones if you prefer)
7. **Account Resources** -> Include -> your account (needed for email destinations)
8. Click **Continue to summary** -> **Create Token**
9. **Copy the token now**. Cloudflare only shows it once.

You can verify the token with curl before pasting into the UI:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
```

Expected:

```json
{"result":{"id":"...","status":"active"},"success":true}
```

---

## 7. Connect your Cloudflare account

In the panel:

1. Click **Cloudflare Accounts** in the sidebar
2. Click **Connect Account**
3. Fill in:
   - **Name**: a label, e.g. `Personal CF` or `Company A`
   - **Email** *(optional)*: just for your reference
   - **API Token**: paste the token from step 6
4. Click **Connect**

The panel will:

- verify the token against Cloudflare
- pull your account ID
- sync every zone (domain) into the local database

You will see a row like:

```
Personal CF    you@example.com    abcd1234...    [4 domains]    just now
```

To re-sync after adding a new zone in Cloudflare, click the **Sync** button on
that row.

> **Tip:** You can connect multiple Cloudflare accounts. Each one keeps its own
> domains, users, and audit log.

---

## 8. Create a user code

Users authenticate with a CODE, not a password. Each code is tied to one
Cloudflare account and a list of domains.

1. Click **Users** in the sidebar
2. Click **Add User**
3. Fill in the form:

   | Field | What to enter |
   |---|---|
   | Cloudflare Account | the account whose domains this user will manage |
   | Note | optional, e.g. "Shop owner - John" |
   | Expiry | choose **7 days**, **30 days**, **Custom**, or **Permanent** |
   | Permissions | tick what they can do (see table below) |
   | Assigned Domains | tick the domains this code can access |
   | Code Prefix | e.g. `USER`, `SHOP`, `VIP`. The code becomes `<PREFIX>-XXXXX` |

4. Click **Create user**

A toast appears with the generated code, for example:

```
Code generated: SHOP-K82P1
```

Use the **COPY** button next to any code to copy it. Send it to your user via
your usual channel.

### Permission cheat sheet

| Permission | What the user can do |
|---|---|
| DNS Access | View, add, edit, delete DNS records, toggle proxy |
| Email Routing | Enable/disable, manage forward rules, manage catch-all |
| Domain Settings | Change SSL mode, Always HTTPS, purge cache |
| Full Domain Access | All of the above + reserved Security tab |

The user **cannot**:

- see other domains
- see your API token
- delete a zone or remove the domain from Cloudflare
- create more users

### Regenerating a code

On the Users page, click the refresh icon on a row.
The old code is invalidated immediately and the user's existing session is
logged out. A new code replaces it.

---

## 9. Use the panel as a user

To test the user view:

1. Open a different browser (or an Incognito window) and go to <http://localhost:3000/login>
2. Paste the code (e.g. `SHOP-K82P1`) and click **Sign in**

The user only sees:

- the **Domains** they were assigned
- the tabs that match their permissions
- no Cloudflare Accounts, no Users, no Audit Logs

Click on a domain. You will see:

- **Overview** -> status, name servers, last edited, plus the setup checker (DNS / Email / SSL)
- **DNS** *(if can_dns)* -> list of records, search, add/edit/delete, proxy toggle
- **Email Routing** *(if can_email)* -> enable, catch-all, forward rules
- **Domain Settings** *(if can_domain_settings)* -> SSL mode, Always HTTPS, cache purge
- **Security** *(if can_full_access)* -> reserved for future expansion

### DNS quick example

1. On a domain, open the **DNS** tab
2. Click **Add Record**
3. Choose `A`, name `www`, content `203.0.113.10`, TTL `Auto` (`1`), proxy on
4. Save

The change is sent to Cloudflare directly and the audit log records it as
`dns.create   example.com:A www`.

---

## 10. Email Routing

Cloudflare Email Routing lets you forward `anything@yourdomain.com` to your
real inbox without running a mail server.

1. On a domain, open **Email Routing**
2. Toggle **Enable Routing** on. The first time, Cloudflare will validate your
   MX records. (If the toggle says routing is **pending**, give it a moment.)
3. Add a forwarding rule:
   - Match: `support@yourdomain.com`
   - Forward to: `you@gmail.com`
4. (Optional) Toggle **Catch-All** on and set a destination

> **Important:** Cloudflare requires every destination address to be verified.
> After you create the first rule, check your inbox for a verification email
> from Cloudflare and click the link. Until you do, mail is dropped.

---

## 11. Domain Settings & Cache Purge

On a domain, open **Domain Settings**:

- **SSL Mode** -> click `flexible`, `full`, or `strict`. `strict` is the
  recommended option if your origin has a valid certificate.
- **Always Use HTTPS** -> toggle on so visitors are auto-redirected from HTTP.
- **Cache Purge**:
  - Paste one URL per line, then click **Purge URLs** to clear specific files.
  - Or click **Purge Everything** to flush the whole zone (with a confirm dialog).

Every change is captured in the audit log.

---

## 12. Audit log

Click **Audit Logs** in the sidebar (admin only).

You will see one row per mutation:

```
2026-05-26 02:15:12   admin          cf_account.create   Personal CF        127.0.0.1
2026-05-26 02:18:33   SHOP-K82P1     dns.create          example.com:A www  203.0.113.5
2026-05-26 02:19:01   SHOP-K82P1     email.enable        example.com        203.0.113.5
```

Filter by action (e.g. `dns.*`) or search by target / IP. Logs are kept until
you delete them manually.

---

## 13. Deploy to production

### 13.1 Easy way: `npm run deploy:setup` (recommended)

One guided command that does the whole production setup for you:

```bash
# from the project root, after `npx wrangler login`
npm run deploy:setup
```

The script will:

| Step | What happens |
|---|---|
| 1 | Verifies you are logged in to Cloudflare (`wrangler whoami`) |
| 2 | Verifies `worker/wrangler.toml` has a real D1 `database_id` |
| 3 | Applies all migrations to **remote** D1 |
| 4 | Generates a strong random `JWT_SECRET` and stores it as a Workers secret |
| 5 | Asks for your frontend URL and writes it into `ALLOWED_ORIGINS` (CORS) |
| 6 | Runs `wrangler deploy` and prints the worker URL |
| 7 | Asks for an admin username + password and bootstraps the first admin |

After it finishes you only need to deploy the **frontend** (see [13.3](#133-build--deploy-the-frontend)).

### 13.2 To re-deploy the worker later (no setup, just code changes)

```bash
npm run deploy:worker
```

### 13.3 Build & deploy the frontend

The deploy script printed your worker URL (e.g.
`https://cfp-worker.<subdomain>.workers.dev`).

Set it in `web/.env.local` (and in your hosting platform's env vars):

```
NEXT_PUBLIC_API_URL=https://cfp-worker.<subdomain>.workers.dev
```

Build:

```bash
npm run build:web
```

Deploy on **Cloudflare Pages**:

```bash
# from the project root
npx wrangler pages deploy web/.next --project-name=cfp-web
```

Or on **Vercel**:

```bash
cd web
npx vercel --prod
```

### 13.4 Manual way (if `deploy:setup` is not what you want)

Run each step yourself:

```bash
# 1. set the JWT secret (one-time)
cd worker
npx wrangler secret put JWT_SECRET
# paste a long random string, e.g. `openssl rand -base64 48`
cd ..

# 2. apply migrations to remote D1
npm run db:migrate:remote

# 3. update CORS in worker/wrangler.toml
#    [vars]
#    ALLOWED_ORIGINS = "https://your-dashboard-domain.com"

# 4. deploy the worker
npm run deploy:worker

# 5. bootstrap the first admin (replace WORKER_URL)
curl -X POST https://WORKER_URL/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"a-very-strong-password"}'
```

### 13.5 Production checklist

- [ ] `JWT_SECRET` set as a Workers secret (not a plain var)
- [ ] `ALLOWED_ORIGINS` matches your frontend domain
- [ ] D1 migrations applied with `--remote`
- [ ] First admin created via `/admin/login` or curl bootstrap
- [ ] Default admin password changed in **Settings -> Change Password**
- [ ] All Cloudflare API tokens are scoped (no Global API Key)

---

## 14. Common commands

```bash
# install + first-time local setup
npm run setup

# dev (worker + web together)
npm run dev
npm run dev:worker          # only API
npm run dev:web             # only dashboard

# database
npm run db:create           # alias for `wrangler d1 create cfp_db`
npm run db:migrate:local    # apply migrations to local D1
npm run db:migrate:remote   # apply migrations to production D1
npm run db:seed:local       # info only (admin is bootstrapped at runtime)
npm run db:seed:remote

# deploy (production)
npm run deploy:setup        # one-time guided setup: secret + CORS + migrate + deploy + admin
npm run deploy:worker       # re-deploy the worker only (after code changes)
npm run build:web           # production build of the dashboard
npm run deploy              # deploy worker AND build web

# direct wrangler from anywhere
npx --workspace worker wrangler tail        # live logs of the worker
npx --workspace worker wrangler d1 execute cfp_db --local --command="SELECT * FROM admins"
npx --workspace worker wrangler secret put JWT_SECRET
npx --workspace worker wrangler secret list
```

---

## 15. Manual install (if `npm run setup` fails)

Run these one by one if the wizard didn't work for you:

```bash
# 1. install
npm install

# 2. config files
cp worker/wrangler.example.toml worker/wrangler.toml
cp worker/.dev.vars.example worker/.dev.vars
cp web/.env.example web/.env.local

# 3. generate a JWT_SECRET
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
# copy the output, then edit worker/.dev.vars:
#   JWT_SECRET = "<paste here>"

# 4. create D1
npx wrangler login
npx --workspace worker wrangler d1 create cfp_db
# copy the database_id from the output, then edit worker/wrangler.toml:
#   database_id = "<paste here>"

# 5. apply migrations
npm run db:migrate:local
```

---

## 16. Reset / fix things

### Forgot the admin password (local)

```bash
npx --workspace worker wrangler d1 execute cfp_db --local \
  --command="DELETE FROM admins WHERE username='admin';"
```

Then go to `/admin/login` and submit new credentials -> they become the new admin.

### Forgot the admin password (production)

```bash
npx --workspace worker wrangler d1 execute cfp_db --remote \
  --command="DELETE FROM admins WHERE username='admin';"
```

### Wipe local DB and start over

```bash
rm -rf worker/.wrangler
npm run db:migrate:local
```

### Frontend stuck in unauthorized loop

Open DevTools -> Application -> Local Storage and remove `cfp_token` and
`cfp_actor`, then refresh.

### Worker port 8787 is already in use

```bash
# pick a different port
cd worker
npx wrangler dev --port 8788

# update web/.env.local accordingly
echo 'NEXT_PUBLIC_API_URL=http://127.0.0.1:8788' > ../web/.env.local
```

### "Cloudflare token invalid" when connecting an account

- Make sure the token has all the scopes listed in [step 6](#6-get-a-cloudflare-api-token)
- Tokens are case-sensitive, with no leading or trailing whitespace
- Verify the token directly:
  ```bash
  curl -H "Authorization: Bearer YOUR_TOKEN" \
       https://api.cloudflare.com/client/v4/user/tokens/verify
  ```

### "cf_account has no account_id; reconnect token"

The token you used was zone-scoped without account read access, so we couldn't
detect your account ID. Add **Account -> Email Routing Addresses -> Edit** to
the token and re-create the connection in **Cloudflare Accounts**.

### "code expired" on user login

The expiry date passed. Edit the user, change expiry to **Permanent** (or
extend it), and re-share the code. Or click the refresh icon to issue a brand
new code.

### `npx wrangler login` hangs

Cancel with `Ctrl+C`, then run:

```bash
npx wrangler logout
npx wrangler login
```

If you're on a headless server, use an API token from
<https://dash.cloudflare.com/profile/api-tokens> and export it:

```bash
export CLOUDFLARE_API_TOKEN=your_token_here
```

### Inspect the database directly

```bash
# list tables
npx --workspace worker wrangler d1 execute cfp_db --local --command=".tables"

# list users
npx --workspace worker wrangler d1 execute cfp_db --local \
  --command="SELECT id, login_code, note, expired_at, is_permanent FROM users"

# list connected CF accounts
npx --workspace worker wrangler d1 execute cfp_db --local \
  --command="SELECT id, name, email FROM cf_accounts"

# tail the audit log
npx --workspace worker wrangler d1 execute cfp_db --local \
  --command="SELECT created_at, actor_type, action, target FROM audit_logs ORDER BY id DESC LIMIT 20"
```

### Tail production logs

```bash
npx --workspace worker wrangler tail
```

---

## 17. Repository Layout

```
SaaS-Cloudflare/
├── worker/        # Cloudflare Workers backend (Hono + D1)
│   ├── src/
│   │   ├── index.ts            # entrypoint + route mounting
│   │   ├── auth.ts             # PBKDF2 + JWT
│   │   ├── middleware.ts       # CORS, auth, permissions
│   │   ├── cloudflare.ts       # CF API client
│   │   ├── audit.ts            # audit log writer
│   │   └── routes/             # auth, cf-accounts, users, domains, dns,
│   │                           #   email-routing, settings, audit-logs
│   ├── migrations/
│   │   └── 0001_init.sql
│   └── wrangler.toml
├── web/           # Next.js 14 (App Router) dark dashboard
│   ├── app/
│   │   ├── login/                user CODE login
│   │   ├── admin/login/          admin login
│   │   └── (panel)/              protected dashboard
│   │       ├── dashboard/
│   │       ├── cloudflare-accounts/
│   │       ├── domains/[id]/{dns,email-routing,settings,security}
│   │       ├── users/
│   │       ├── audit-logs/
│   │       └── settings/
│   ├── components/             Sidebar, Modal, Toggle, CopyButton, Toast, Icon
│   └── lib/api.ts              typed fetch client + auth storage
├── shared/types.ts             shared TypeScript types
├── scripts/                    setup.mjs, dev.mjs (cross-platform)
└── README.md                   this file
```

---

## 18. Security Model

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

## 19. License

MIT
