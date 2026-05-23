# Cloudflare Domain Management Panel

A SaaS-style dashboard for managing Cloudflare zones across **multiple Cloudflare accounts** and **multiple users**, with granular per-domain permissions, DNS management, Email Routing, and audit logging.

> Backend: Cloudflare Workers + D1 - Frontend: Next.js + Tailwind (Dark Mode) - Auth: JWT.

---

## Features

- Admin login (username + password, hashed with PBKDF2-SHA-256)
- User login by **CODE** (temporary or permanent)
- Connect **multiple Cloudflare accounts** (API token, scoped)
- All domains stay inside the admin's Cloudflare accounts
- Per-user **domain assignment** via checkboxes
- Permission flags: DNS / Email Routing / Domain Settings / Full Access
- DNS records CRUD (with proxy toggle)
- Email Routing: enable/disable, catch-all, forward rules, destinations
- Domain Settings: SSL mode, Always HTTPS, Cache Purge
- Setup checker (DNS/Email/SSL)
- Audit logs (every mutation, with IP)
- Session revocation (regenerating a code logs the user out)
- Dark mode UI inspired by Cloudflare / GitHub / Vercel

---

## Repository Layout

```
SaaS-Cloudflare/
├── worker/        # Cloudflare Workers backend (Hono + D1)
│   ├── src/
│   ├── migrations/
│   ├── wrangler.toml
│   └── package.json
├── web/           # Next.js 14 (App Router) dark dashboard
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── package.json
├── shared/        # Shared TypeScript types
└── package.json   # npm workspaces root
```

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure backend

```bash
cd worker
cp wrangler.example.toml wrangler.toml
# fill in your D1 database id and a JWT secret
```

### 3. Create the D1 database & run migrations

```bash
# create D1 (one time)
npx wrangler d1 create cfp_db
# copy the returned database_id into wrangler.toml

# run migrations
npm run db:migrate:local        # local dev
npm run db:migrate:remote       # production

# seed the initial admin (default: admin / admin123 - change immediately)
npm run db:seed:local
```

### 4. Run the worker (backend)

```bash
npm run dev:worker
# -> http://127.0.0.1:8787
```

### 5. Run the frontend

```bash
cd web
cp .env.example .env.local      # set NEXT_PUBLIC_API_URL=http://127.0.0.1:8787
cd ..
npm run dev:web
# -> http://localhost:3000
```

### 6. Log in

- Admin: `http://localhost:3000/admin/login` (default `admin / admin123`)
- User:  `http://localhost:3000/login` (paste a CODE)

### 7. Deploy to Cloudflare

```bash
# backend
npm run deploy:worker

# frontend (Cloudflare Pages or Vercel)
npm run build:web
```

---

## Cloudflare API Token Scopes

When connecting a Cloudflare account, the API token must have at least:

- Zone - Zone - Read
- Zone - DNS - Edit
- Zone - Email Routing Rules - Edit
- Zone - Email Routing Addresses - Edit
- Zone - Zone Settings - Edit
- Zone - Cache Purge - Purge
- Account - Email Routing Addresses - Edit (account scoped destinations)

The token is stored encrypted-at-rest in D1 and **never** returned to the frontend.

---

## Security Model

- Passwords hashed with PBKDF2-SHA-256 (210k iters) using Web Crypto.
- Sessions are signed JWTs (HS256) using `JWT_SECRET`.
- User JWT is bound to `login_code`; regenerating the code invalidates all old tokens.
- The frontend never sees Cloudflare API tokens or password hashes.
- Per-request authorization checks domain ownership and permission flags.
- All mutations are written to `audit_logs` with actor, action, target, and IP.

---

## License

MIT
