#!/usr/bin/env node
// Cross-platform one-shot setup script.
//   npm run setup
//
// 1. Verifies Node 20+
// 2. Runs `npm install` if node_modules is missing
// 3. Copies worker/wrangler.example.toml -> worker/wrangler.toml
// 4. Generates worker/.dev.vars with a random JWT_SECRET
// 5. Optionally creates a D1 database and writes its id into wrangler.toml
// 6. Applies all migrations to the local D1
// 7. Builds the dashboard (web/dist) so it is ready to be served by the worker

import { spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
} from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const C = {
  reset: "\x1b[0m",
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
  return spawnSync(cmd, args, {
    stdio: opts.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
    ...opts,
  });
}

banner("Cloudflare Domain Panel - Setup");
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 20) {
  err(`Node ${process.versions.node} is too old. Please use Node 20 or later.`);
  process.exit(1);
}
ok(`Node ${process.versions.node}`);

if (!existsSync(resolve(root, "node_modules"))) {
  log("Installing dependencies (this may take a minute)...");
  const r = runSync("npm", ["install"], { cwd: root });
  if (r.status !== 0) {
    err("npm install failed");
    process.exit(1);
  }
}
ok("Dependencies installed");

const workerDir = resolve(root, "worker");
const wranglerToml = resolve(workerDir, "wrangler.toml");
const wranglerExample = resolve(workerDir, "wrangler.example.toml");
if (!existsSync(wranglerToml)) {
  copyFileSync(wranglerExample, wranglerToml);
  ok("Created worker/wrangler.toml");
} else {
  ok("worker/wrangler.toml exists");
}

const devVars = resolve(workerDir, ".dev.vars");
if (!existsSync(devVars)) {
  const secret = randomBytes(48).toString("base64url");
  writeFileSync(devVars, `JWT_SECRET = "${secret}"\n`);
  ok("Generated worker/.dev.vars with random JWT_SECRET");
} else {
  ok("worker/.dev.vars exists");
}

banner("D1 Database");
const tomlContent = readFileSync(wranglerToml, "utf8");
const placeholder = "REPLACE_WITH_YOUR_D1_DATABASE_ID";
const idMatch = tomlContent.match(/database_id\s*=\s*"([^"]+)"/);

if (idMatch && idMatch[1] !== placeholder) {
  ok(`D1 database_id already set: ${idMatch[1]}`);
  log("Applying migrations (local)...");
  runSync(
    "npx",
    ["wrangler", "d1", "migrations", "apply", "cfp_db", "--local"],
    { cwd: workerDir }
  );
} else {
  warn("D1 database_id is not set yet.");
  console.log(`
  This step requires:
   - A Cloudflare account
   - You must be logged in:  ${C.cyan}npx wrangler login${C.reset}
`);
  const create = await ask("Create a new D1 database now? (y/N)", "n");
  if (create.toLowerCase().startsWith("y")) {
    log("Running: npx wrangler d1 create cfp_db");
    const r = runSync("npx", ["wrangler", "d1", "create", "cfp_db"], {
      cwd: workerDir,
      capture: true,
    });
    process.stdout.write(r.stdout || "");
    if (r.stderr) process.stderr.write(r.stderr);
    const m = (r.stdout || "").match(/database_id\s*=\s*"([^"]+)"/);
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
      `Skipped. Edit ${C.cyan}worker/wrangler.toml${C.reset} and replace ${placeholder}, then run:`
    );
    console.log(`     ${C.cyan}npm run db:migrate:local${C.reset}`);
  }
}

banner("Build the dashboard (web/dist)");
log("Running: npm --workspace web run build");
const b = runSync("npm", ["--workspace", "web", "run", "build"], { cwd: root });
if (b.status !== 0) {
  warn("Frontend build failed. You can re-run later with `npm run build`.");
} else {
  ok("Dashboard built -> web/dist");
}

banner("All set!");
console.log(`
Next steps:

  1. Start dev servers:
       ${C.cyan}npm run dev${C.reset}
       Worker:    http://127.0.0.1:8787   (UI + API together)
       Vite dev:  http://localhost:5173   (faster UI dev with hot reload, API proxied)

  2. Open ${C.cyan}http://127.0.0.1:8787${C.reset} (or :5173) and create the first admin
     at ${C.cyan}/admin/login${C.reset}.

To deploy to production (Cloudflare Workers):
  ${C.cyan}npm run deploy:setup${C.reset}    # one-time: secret + remote migrations + admin
  ${C.cyan}npm run deploy${C.reset}          # build dashboard + wrangler deploy

After deploy, your single URL serves everything:
  https://cfp-worker.<subdomain>.workers.dev
`);
