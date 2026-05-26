# Cloudflare Domain Management Panel

A SaaS-style dashboard for managing Cloudflare zones across **multiple Cloudflare accounts** and **multiple users**, with granular per-domain permissions, DNS management, Email Routing, and audit logging.

> Backend: Cloudflare Workers + D1   Frontend: Next.js + Tailwind (Dark Mode)   Auth: JWT.

---

## Table of Contents

- [Quick Start (3 commands)](#quick-start-3-commands)
- [Requirements](#requirements)
- [Step-by-step install](#step-by-step-install)
- [Manual install (if `npm run setup` fails)](#manual-install-if-npm-run-setup-fails)
- [Run the app](#run-the-app)
- [First admin login](#first-admin-login)
- [Connect a Cloudflare account](#connect-a-cloudflare-account)
- [Create a user code](#create-a-user-code)
- [Deploy to production](#deploy-to-production)
- [Common commands](#common-commands)
- [Reset / fix things](#reset--fix-things)
- [Repository Layout](#repository-layout)
- [Cloudflare API token scopes](#cloudflare-api-token-scopes)
- [Security Model](#security-model)
- [License](#license)

---

## Quick Start (3 commands)

```bash
git clone https://github.com/premitry/SaaS-Cloudflare.git
cd SaaS-Cloudflare
npm run setup     # installs deps, generates secrets, creates D1, runs migrations
npm run dev       # starts worker (8787) + web (3000) together
```

Open <http://localhost:3000>, click **Admin login**, and submit any
username + password (>= 8 chars). On a fresh database the first credentials
you submit become the initial admin.

For the full walkthrough see **[TUTORIAL.md](./TUTORIAL.md)**.

---

## Requirements

| Tool | Min version | Check command |
|---|---|---|
| Node.js | 20 | `node --version` |
| npm | 10 | `npm --version` |
| git | any | `git --version` |
| Cloudflare account | free plan OK | <https://dash.cloudflare.com/sign-up> |

If you don't have Node 20+, install it from <https://nodejs.org> or via nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20
nvm use 20
```

---

## Step-by-step install

### 1. Clone the repo

```bash
git clone https://github.com/premitry/SaaS-Cloudflare.git
cd SaaS-Cloudflare
```

### 2. Log in to Cloudflare CLI (one-time)

This opens your browser so the wrangler CLI can talk to your account.
Required only the first time and only if you want the setup script to create the
D1 database for you.

```bash
npx wrangler login
```

Verify:

```bash
npx wrangler whoami
```

Expected output (your email/account):

```
You are logged in with the OAuth Token, associated with the email you@example.com
Your account ID: abcd1234ef5678...
```

### 3. Run the setup wizard

```bash
npm run setup
```

When prompted **"Create a new D1 database now? (y/N)"** type **`y`** and press Enter.

The script will:

1. install all dependencies (`npm install`)
2. create `worker/wrangler.toml` from the example
3. generate a random `JWT_SECRET` and write it to `worker/.dev.vars`
4. create `web/.env.local`
5. run `npx wrangler d1 create cfp_db` and put the returned ID into `wrangler.toml`
6. apply migrations to your local D1 (`wrangler d1 migrations apply cfp_db --local`)

It is **safe to re-run** at any time. It will not overwrite files that already exist.

---

## Manual install (if `npm run setup` fails)

Run these one by one if the wizard didn't work for you:

```bash
# 1. install
npm install

# 2. config files
cp worker/wrangler.example.toml worker/wrangler.toml
cp worker/.dev.vars.example worker/.dev.vars
cp web/.env.example web/.env.local

# 3. generate a JWT_SECRET (replace the placeholder)
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

## Run the app

```bash
npm run dev
```

You will see prefixed logs like:

```
[worker] Ready on http://127.0.0.1:8787
[web   ] - Local:  http://localhost:3000
```

Open <http://localhost:3000>. Stop both servers with `Ctrl+C` once.

If you only want one of them:

```bash
npm run dev:worker     # only the API on :8787
npm run dev:web        # only the dashboard on :3000
```

---

## First admin login

1. Go to <http://localhost:3000/admin/login>
2. Type any username (e.g. `admin`) and a password of at least 8 characters
3. Click **Sign in**

> On an empty database, the first credentials you submit become the admin.

You can also bootstrap via curl (useful for headless setups):

```bash
curl -X POST http://127.0.0.1:8787/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"YourStrongPassword!"}'
```

---

## Connect a Cloudflare account

1. Create a scoped API token at <https://dash.cloudflare.com/profile/api-tokens>
   (see [scopes below](#cloudflare-api-token-scopes))
2. In the panel, open **Cloudflare Accounts**  ->  **Connect Account**
3. Paste the token and click **Connect**

The panel verifies the token, captures your account ID, and syncs every zone
into the local database.

You can also test the token quickly:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/verify
```

---

## Create a user code

In the panel:

1. **Users**  ->  **Add User**
2. Pick a Cloudflare account, set expiry (1d / 7d / 30d / custom / permanent)
3. Tick the **permissions**: DNS / Email Routing / Domain Settings / Full Access
4. Tick the **domains** the code may access
5. Click **Create user**  ->  the generated code (e.g. `SHOP-K82P1`) appears

Share the code with your user. They log in at <http://localhost:3000/login>.

To rotate a user's code (which logs them out instantly):
- click the refresh icon on the user row.

---

## Deploy to production

### 1. Set the production JWT secret (one-time)

```bash
cd worker
npx wrangler secret put JWT_SECRET
# paste a long random string (e.g. `openssl rand -base64 48`) when prompted
cd ..
```

### 2. Apply migrations to remote D1 (one-time per change)

```bash
npm run db:migrate:remote
```

### 3. Deploy the worker

```bash
npm run deploy:worker
```

Wrangler prints a URL like `https://cfp-worker.<subdomain>.workers.dev`. Save it.

### 4. Update CORS allowlist on the worker

Edit `worker/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://your-dashboard-domain.com"
```

Re-deploy:

```bash
npm run deploy:worker
```

### 5. Build & deploy the frontend

Edit `web/.env.local` (and your hosting platform's env vars):

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

### 6. Bootstrap the production admin

```bash
curl -X POST https://cfp-worker.<subdomain>.workers.dev/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"a-very-strong-password"}'
```

After that, change the password from **Settings -> Change Password** in the dashboard.

---

## Common commands

```bash
# install + first-time setup
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

# deploy
npm run deploy:worker       # deploy backend to Cloudflare Workers
npm run build:web           # production build of the dashboard
npm run deploy              # deploy worker AND build web

# direct wrangler from anywhere
npx --workspace worker wrangler tail        # live logs of the worker
npx --workspace worker wrangler d1 execute cfp_db --local --command="SELECT * FROM admins"
npx --workspace worker wrangler secret put JWT_SECRET
npx --workspace worker wrangler secret list
```

---

## Reset / fix things

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

## Repository Layout

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
├── README.md                   this file
└── TUTORIAL.md                 step-by-step walkthrough
```

---

## Cloudflare API token scopes

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

## Security Model

- Passwords hashed with **PBKDF2-SHA-256** (210,000 iterations) via Web Crypto
- Sessions are signed JWTs (HS256) using `JWT_SECRET` (random per install)
- User JWT is bound to `login_code` -> regenerating a code instantly invalidates all old tokens
- The frontend never sees Cloudflare API tokens or password hashes
- Per-request authorization checks domain ownership AND permission flags
- Every mutation is written to `audit_logs` with actor, action, target, and IP

---

## License

MIT
