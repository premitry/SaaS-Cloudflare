# Tutorial - Cloudflare Domain Management Panel

A complete, beginner-friendly walkthrough. By the end you will have:

- a running local copy with a working admin account
- a connected Cloudflare account with all your zones synced
- a user code that lets a teammate manage DNS for selected domains only
- a deployed production version on Cloudflare

---

## Table of Contents

1. [Requirements](#1-requirements)
2. [Install](#2-install)
3. [Run](#3-run)
4. [First admin login](#4-first-admin-login)
5. [Get a Cloudflare API token](#5-get-a-cloudflare-api-token)
6. [Connect your Cloudflare account](#6-connect-your-cloudflare-account)
7. [Create a user code](#7-create-a-user-code)
8. [Use the panel as a user](#8-use-the-panel-as-a-user)
9. [Email Routing](#9-email-routing)
10. [Domain Settings & Cache Purge](#10-domain-settings--cache-purge)
11. [Audit log](#11-audit-log)
12. [Deploy to production](#12-deploy-to-production)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Requirements

You need:

- **Node.js 20+** -> <https://nodejs.org/>
- **Git** -> <https://git-scm.com/>
- A free **Cloudflare account** -> <https://dash.cloudflare.com/sign-up>
- At least one domain added to that Cloudflare account (any plan, free is fine)

Check your Node version:

```bash
node --version
# v20.x or later
```

---

## 2. Install

```bash
# clone
git clone https://github.com/premitry/SaaS-Cloudflare.git
cd SaaS-Cloudflare

# log in to Cloudflare CLI (opens a browser, one-time)
npx wrangler login

# run the setup wizard
npm run setup
```

`npm run setup` does all of this for you:

| Step | What happens |
|---|---|
| 1 | Verifies Node 20+ |
| 2 | Runs `npm install` if needed |
| 3 | Creates `worker/wrangler.toml` from the example |
| 4 | Generates a random `JWT_SECRET` in `worker/.dev.vars` |
| 5 | Creates `web/.env.local` from the example |
| 6 | Asks if you want to create a D1 database (answer **y**) |
| 7 | Writes the database ID into `wrangler.toml` automatically |
| 8 | Applies all migrations to local D1 |

When prompted "Create a new D1 database now?" answer **y**. The script will run
`npx wrangler d1 create cfp_db` for you and parse the result.

---

## 3. Run

```bash
npm run dev
```

You will see two prefixed log streams:

```
[worker] Ready on http://127.0.0.1:8787
[web   ] - Local:  http://localhost:3000
```

Leave this running. To stop, press `Ctrl+C` once.

---

## 4. First admin login

1. Open <http://localhost:3000>
2. Click **Admin login** (or go to `/admin/login`).
3. Type a username (e.g. `admin`) and a password of at least 8 characters.
4. Click **Sign in**.

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

---

## 5. Get a Cloudflare API token

1. Open <https://dash.cloudflare.com/profile/api-tokens>
2. Click **Create Token**.
3. Choose **Create Custom Token**.
4. Give it a name (e.g. `panel-token`).
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

6. **Zone Resources** -> Include -> All zones (or a specific zone if you prefer).
7. **Account Resources** -> Include -> your account (needed for email destinations).
8. Click **Continue to summary** -> **Create Token**.
9. **Copy the token now**. Cloudflare only shows it once.

---

## 6. Connect your Cloudflare account

In the panel:

1. Click **Cloudflare Accounts** in the sidebar.
2. Click **Connect Account**.
3. Fill in:
   - **Name**: a label, e.g. `Personal CF` or `Company A`
   - **Email** *(optional)*: just for your reference
   - **API Token**: paste the token from step 5
4. Click **Connect**.

The panel will:

- verify the token against Cloudflare
- pull your account ID
- sync every zone (domain) you have into the local database

You will see a row like:

```
Personal CF    you@example.com    abcd1234...    [4 domains]    just now
```

To re-sync after adding a new zone in Cloudflare, click the **Sync** button on
that row.

> **Tip:** You can connect multiple Cloudflare accounts. Each one keeps its own
> domains, users and audit log.

---

## 7. Create a user code

Users authenticate with a CODE, not a password. Each code is tied to one
Cloudflare account and a list of domains.

1. Click **Users** in the sidebar.
2. Click **Add User**.
3. Fill in the form:

   | Field | What to enter |
   |---|---|
   | Cloudflare Account | the account whose domains this user will manage |
   | Note | optional, e.g. "Shop owner - John" |
   | Expiry | choose **7 days**, **30 days**, **Custom**, or **Permanent** |
   | Permissions | tick what they can do (see table below) |
   | Assigned Domains | tick the domains this code can access |
   | Code Prefix | e.g. `USER`, `SHOP`, `VIP`. The code becomes `<PREFIX>-XXXXX` |

4. Click **Create user**.

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

## 8. Use the panel as a user

To test the user view:

1. Open a different browser (or an Incognito window) and go to <http://localhost:3000/login>.
2. Paste the code (e.g. `SHOP-K82P1`) and click **Sign in**.

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

1. On a domain, open the **DNS** tab.
2. Click **Add Record**.
3. Choose `A`, name `www`, content `203.0.113.10`, TTL `Auto` (`1`), proxy on.
4. Save.

The change is sent to Cloudflare directly and the audit log records it as
`dns.create   example.com:A www`.

---

## 9. Email Routing

Cloudflare Email Routing lets you forward `anything@yourdomain.com` to your
real inbox without running a mail server.

1. On a domain, open **Email Routing**.
2. Toggle **Enable Routing** on. The first time, Cloudflare will validate your
   MX records. (If the toggle says routing is **pending**, give it a moment.)
3. Add a forwarding rule:
   - Match: `support@yourdomain.com`
   - Forward to: `you@gmail.com`
4. (Optional) Toggle **Catch-All** on and set a destination.

> **Important:** Cloudflare requires every destination address to be verified.
> After you create the first rule, check your inbox for a verification email
> from Cloudflare and click the link. Until you do, mail is dropped.

---

## 10. Domain Settings & Cache Purge

On a domain, open **Domain Settings**:

- **SSL Mode** -> click `flexible`, `full`, or `strict`. `strict` is the
  recommended option if your origin has a valid certificate.
- **Always Use HTTPS** -> toggle on so visitors are auto-redirected from HTTP.
- **Cache Purge**:
  - Paste one URL per line, then click **Purge URLs** to clear specific files.
  - Or click **Purge Everything** to flush the whole zone (with a confirm dialog).

Every change is captured in the audit log.

---

## 11. Audit log

Click **Audit Logs** in the sidebar (admin only).

You will see one row per mutation:

```
2026-05-26 02:15:12   admin    cf_account.create   Personal CF      127.0.0.1
2026-05-26 02:18:33   SHOP-K82P1   dns.create     example.com:A www  203.0.113.5
2026-05-26 02:19:01   SHOP-K82P1   email.enable    example.com       203.0.113.5
```

Filter by action (e.g. `dns.*`) or search by target/IP. Logs are kept until you
delete them manually.

---

## 12. Deploy to production

### 12.1 Backend (Cloudflare Workers)

```bash
# Set your production JWT secret (NOT the same as your local one)
cd worker
npx wrangler secret put JWT_SECRET
# paste a long random string when prompted, e.g. `openssl rand -base64 48`
cd ..

# Apply migrations to the remote D1 database (one-time)
npm run db:migrate:remote

# Deploy
npm run deploy:worker
```

Wrangler prints a URL like `https://cfp-worker.<your-subdomain>.workers.dev`.
Copy it.

### 12.2 Frontend (Cloudflare Pages or Vercel)

Edit `web/.env.local` (and your hosting platform's env vars) so:

```
NEXT_PUBLIC_API_URL=https://cfp-worker.<your-subdomain>.workers.dev
```

Then update the worker's CORS allowlist (`worker/wrangler.toml`):

```toml
[vars]
ALLOWED_ORIGINS = "https://your-frontend-domain.com"
```

Re-deploy the worker (`npm run deploy:worker`).

#### Option A - Cloudflare Pages (recommended)

```bash
npm run build:web

# in the Cloudflare dashboard:
# Workers & Pages > Create application > Pages > Direct Upload
# upload web/.next/standalone (or use the Wrangler Pages publish command)
```

#### Option B - Vercel

```bash
# from the web/ folder
cd web
npx vercel --prod
```

Make sure to set `NEXT_PUBLIC_API_URL` in the Vercel project settings.

### 12.3 Production checklist

- [ ] `JWT_SECRET` set as a Workers secret (not a plain var)
- [ ] `ALLOWED_ORIGINS` matches your frontend domain
- [ ] D1 migrations applied with `--remote`
- [ ] First admin created via `/admin/login`
- [ ] Default admin password changed in **Settings -> Change Password**
- [ ] All Cloudflare API tokens are scoped (no Global API Key)

---

## 13. Troubleshooting

### "Cloudflare token invalid" when connecting an account

- Make sure the token has all the scopes listed in [step 5](#5-get-a-cloudflare-api-token).
- Tokens are case-sensitive, with no leading/trailing whitespace.
- Try the token directly:
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

### Worker port 8787 already in use

```bash
# pick a different port
cd worker
npx wrangler dev --port 8788
# then update web/.env.local:
# NEXT_PUBLIC_API_URL=http://127.0.0.1:8788
```

### Frontend shows "unauthorized" loops

Open DevTools -> Application -> Local Storage and clear `cfp_token` and
`cfp_actor`, then refresh.

### "npx wrangler login" hangs

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

### I forgot the admin password

There is no recovery email. Open the local D1 database and reset:

```bash
cd worker
npx wrangler d1 execute cfp_db --local \
  --command="DELETE FROM admins WHERE username='admin';"
```

Then go to `/admin/login` and submit any credentials -> they become the new
first admin.

---

## What next?

- Set up a custom domain for both the worker and the frontend
- Add 2FA for admins (TOTP)
- Hook the worker into Workers KV for token-revocation lists
- Extend the Security tab with WAF, rate limiting, and Workers Routes

PRs welcome.
