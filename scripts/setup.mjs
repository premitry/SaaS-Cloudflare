#!/usr/bin/env node
// Cross-platform one-shot setup script.
// Usage:  npm run setup
//
// What it does:
// 1. Verifies Node 20+
// 2. Runs `npm install` if node_modules is missing
// 3. Copies worker/wrangler.example.toml -> worker/wrangler.toml (if missing)
// 4. Generates worker/.dev.vars with a random JWT_SECRET (if missing)
// 5. Copies web/.env.example -> web/.env.local (if missing)
// 6. Optionally creates a D1 database and applies migrations
// 7. Prints next-steps

import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

const log = (m) => console.log(`${C.cyan}>${C.reset} ${m}`);
const ok = (m) => console.log(`${C.green}OK${C.reset} ${m}`);
const warn = (m) => console.log(`${C.yellow}!!${C.reset} ${m}`);
const err = (m) => console.error(`${C.red}XX${C.reset} ${m}`);
const banner = (m) =>
  console.log(`\n${C.bold}${C.magenta}== ${m} ==${C.reset}`);

function ask(q, def = "") {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((res) => {
    rl.question(`  ${q}${def ? ` [${def}]` : ""}: `, (a) => {
      rl.close();
      res(a.trim() || def);
    });
  });
}

function runSync(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    stdio: opts.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
  return r;
}

// ---- Step 1: Node version ----
banner("Cloudflare Domain Panel - Setup");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  err(`Node ${process.versions.node} is too old. Please use Node 20 or later.`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

// ---- Step 2: Install deps ----
if (!existsSync(resolve(root, "node_modules"))) {
  log("Installing dependencies (this may take a minute)...");
  const r = runSync("npm", ["install"], { cwd: root });
  if (r.status !== 0) {
    err("npm install failed");
    process.exit(1);
  }
}
ok("Dependencies installed");

// ---- Step 3: worker/wrangler.toml ----
const workerDir = resolve(root, "worker");
const wranglerToml = resolve(workerDir, "wrangler.toml");
const wranglerExample = resolve(workerDir, "wrangler.example.toml");
if (!existsSync(wranglerToml)) {
  copyFileSync(wranglerExample, wranglerToml);
  ok("Created worker/wrangler.toml");
} else {
  ok("worker/wrangler.toml exists");
}

// ---- Step 4: worker/.dev.vars (JWT secret) ----
const devVars = resolve(workerDir, ".dev.vars");
if (!existsSync(devVars)) {
  const secret = randomBytes(48).toString("base64url");
  writeFileSync(devVars, `JWT_SECRET = "${secret}"\n`);
  ok("Generated worker/.dev.vars with random JWT_SECRET");
} else {
  ok("worker/.dev.vars exists");
}

// ---- Step 5: web/.env.local ----
const webEnv = resolve(root, "web/.env.local");
if (!existsSync(webEnv)) {
  copyFileSync(resolve(root, "web/.env.example"), webEnv);
  ok("Created web/.env.local");
} else {
  ok("web/.env.local exists");
}

// ---- Step 6: D1 database ----
banner("D1 Database");
const tomlContent = readFileSync(wranglerToml, "utf8");
const placeholder = "REPLACE_WITH_YOUR_D1_DATABASE_ID";
const idMatch = tomlContent.match(/database_id\s*=\s*"([^"]+)"/);

if (idMatch && idMatch[1] !== placeholder) {
  ok(`D1 database_id already set: ${idMatch[1]}`);
  log("Applying migrations (local)...");
  runSync("npx", ["wrangler", "d1", "migrations", "apply", "cfp_db", "--local"], {
    cwd: workerDir,
  });
} else {
  warn("D1 database_id is not set yet.");
  console.log(`
  This step requires:
   - A Cloudflare account
   - You must be logged in:  ${C.cyan}npx wrangler login${C.reset}
   - Network access to api.cloudflare.com
`);
  const create = await ask("Create a new D1 database now? (y/N)", "n");
  if (create.toLowerCase().startsWith("y")) {
    log("Running: npx wrangler d1 create cfp_db");
    const r = runSync("npx", ["wrangler", "d1", "create", "cfp_db"], {
      cwd: workerDir,
      capture: true,
    });
    const stdout = r.stdout || "";
    const stderr = r.stderr || "";
    process.stdout.write(stdout);
    if (stderr) process.stderr.write(stderr);
    const m = stdout.match(/database_id\s*=\s*"([^"]+)"/);
    if (m) {
      const newId = m[1];
      const updated = readFileSync(wranglerToml, "utf8").replace(
        placeholder,
        newId
      );
      writeFileSync(wranglerToml, updated);
      ok(`Saved database_id = ${newId}`);
      log("Applying migrations (local)...");
      runSync(
        "npx",
        ["wrangler", "d1", "migrations", "apply", "cfp_db", "--local"],
        { cwd: workerDir }
      );
      ok("Migrations applied");
    } else {
      warn(
        `Could not parse database_id from wrangler output. Edit ${C.cyan}worker/wrangler.toml${C.reset} manually and re-run setup.`
      );
    }
  } else {
    warn(
      `Skipped. Edit ${C.cyan}worker/wrangler.toml${C.reset} and replace ${placeholder} with your D1 id, then run:`
    );
    console.log(`     ${C.cyan}npm run db:migrate:local${C.reset}`);
  }
}

// ---- Done ----
banner("All set!");
console.log(`
Next steps:

  1. Start dev servers (worker + web together):
       ${C.cyan}npm run dev${C.reset}

  2. Open the dashboard:
       ${C.cyan}http://localhost:3000${C.reset}

  3. Click "Admin login" and submit any username + password (>= 8 chars).
     On a fresh DB, the first credentials you submit become the admin.

  4. Connect a Cloudflare account, then create user codes.

For full walkthrough see ${C.cyan}TUTORIAL.md${C.reset}.

To deploy to production:
  ${C.cyan}npm run deploy:worker${C.reset}     # backend (Cloudflare Workers)
  ${C.cyan}npm run build:web${C.reset}         # frontend (Cloudflare Pages / Vercel)
`);
