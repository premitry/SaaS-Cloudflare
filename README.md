# Cloudflare Domain Management Panel

A SaaS-style dashboard for managing Cloudflare zones across **multiple Cloudflare accounts** and **multiple users**, with granular per-domain permissions, DNS management, Email Routing, and audit logging.

> Backend: Cloudflare Workers + D1   Frontend: Next.js + Tailwind (Dark Mode)   Auth: JWT.

---

## Quick Start (3 commands)

```bash
git clone https://github.com/premitry/SaaS-Cloudflare.git
cd SaaS-Cloudflare
npm run setup     # installs deps, generates secrets, creates D1, runs migrations
npm run dev       # starts worker (8787) + web (3000) together
```

Open <http://localhost:3000>, click **Admin login**, and submit any
username + password (>= 8 chars). On a fresh database, the first credentials
you submit are saved as the initial admin.

That's it. For the full walkthrough including how to connect a Cloudflare
account and create user codes, see **[TUTORIAL.md](./TUTORIAL.md)**.

---

## Features

- Admin login (username + password, hashed with PBKDF2-SHA-256)
- User login by **CODE** (temporary 1d/7d/30d/custom or permanent)
- Connect **multiple Cloudflare accounts** (scoped API tokens)
- All domains stay inside the admin's Cloudflare accounts
- Per-user **domain assignment** with checkbox + search
- Permission flags: DNS / Email Routing / Domain Settings / Full Access
- DNS records CRUD with proxy toggle
- Email Routing: enable/disable, catch-all, forward rules, destinations
- Domain Settings: SSL mode, Always HTTPS, Cache Purge
- Setup checker (DNS/Email/SSL)
- Audit logs (every mutation, with IP)
- Session revocation (regenerating a code logs the user out everywhere)
- Dark mode UI inspired by Cloudflare / GitHub / Vercel

---

## Repository Layout

```
SaaS-Cloudflare/
├── worker/        # Cloudflare Workers backend (Hono + D1)
├── web/           # Next.js 14 (App Router) dark dashboard
├── shared/        # Shared TypeScript types
├── scripts/       # setup.mjs, dev.mjs (cross-platform)
├── README.md
└── TUTORIAL.md    # Step-by-step walkthrough
```

---

## Common Commands

| Command | What it does |
|---|---|
| `npm run setup` | One-shot installer: deps, configs, D1, migrations |
| `npm run dev` | Starts worker (8787) + web (3000) together |
| `npm run dev:worker` | Worker only |
| `npm run dev:web` | Web only |
| `npm run db:migrate:local` | Apply migrations to local D1 |
| `npm run db:migrate:remote` | Apply migrations to production D1 |
| `npm run deploy:worker` | Deploy worker to Cloudflare |
| `npm run build:web` | Production build of the dashboard |

---

## Cloudflare API Token Scopes

When connecting a Cloudflare account, the API token must have:

- **Zone**  Zone  Read
- **Zone**  DNS  Edit
- **Zone**  Email Routing Rules  Edit
- **Zone**  Email Routing Addresses  Edit
- **Zone**  Zone Settings  Edit
- **Zone**  Cache Purge  Purge
- **Account**  Email Routing Addresses  Edit (account scoped destinations)

The token is stored in D1 and **never** returned to the frontend.

---

## Security Model

- Passwords hashed with PBKDF2-SHA-256 (210k iterations) using Web Crypto.
- Sessions are signed JWTs (HS256) using `JWT_SECRET`.
- User JWT is bound to `login_code`; regenerating the code invalidates all old tokens.
- The frontend never sees Cloudflare API tokens or password hashes.
- Per-request authorization checks domain ownership and permission flags.
- All mutations are written to `audit_logs` with actor, action, target, and IP.

---

## License

MIT
