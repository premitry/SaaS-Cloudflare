#!/usr/bin/env node
// Guided one-shot production deploy.
//   npm run deploy:setup
//
// Steps:
// 1. Verify wrangler is logged in
// 2. Verify worker/wrangler.toml has a real D1 database_id
// 3. Apply migrations to remote D1
// 4. Generate a strong JWT_SECRET and store it as a Workers secret
// 5. Build the dashboard (web/dist)
// 6. Run `wrangler deploy` (Worker serves both UI and API)
// 7. Optionally bootstrap the first admin via the deployed URL

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const workerDir = resolve(root, "worker");

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
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

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    stdio: opts.capture ? "pipe" : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
    cwd: workerDir,
    ...opts,
  });
}

banner("Cloudflare Domain Panel - Production Deploy");

// 1. wrangler login
log("Checking wrangler authentication...");
const whoami = run("npx", ["wrangler", "whoami"], { capture: true });
if (whoami.status !== 0) {
  err("Not logged in to Cloudflare.");
  console.log(`     Run: ${C.cyan}npx wrangler login${C.reset}`);
  process.exit(1);
}
const emailMatch = (whoami.stdout || "").match(/[\w.\-+]+@[\w.\-]+/);
ok(`Authenticated as ${emailMatch?.[0] ?? "(account)"}`);

// 2. Verify wrangler.toml D1
const tomlPath = resolve(workerDir, "wrangler.toml");
if (!existsSync(tomlPath)) {
  err("worker/wrangler.toml not found.");
  console.log(`     Run: ${C.cyan}npm run setup${C.reset} first`);
  process.exit(1);
}
const toml = readFileSync(tomlPath, "utf8");
if (toml.includes("REPLACE_WITH_YOUR_D1_DATABASE_ID")) {
  err("D1 database_id is not set in worker/wrangler.toml.");
  console.log(`     Run: ${C.cyan}npm run setup${C.reset} first`);
  process.exit(1);
}
const dbIdMatch = toml.match(/database_id\s*=\s*"([^"]+)"/);
ok(`D1 database_id = ${dbIdMatch?.[1] ?? "(unknown)"}`);

// 3. Remote migrations
banner("Apply D1 Migrations (remote)");
log("Running: npx wrangler d1 migrations apply cfp_db --remote");
const mig = run("npx", [
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "cfp_db",
  "--remote",
]);
if (mig.status !== 0) {
  err("Migrations failed. See output above.");
  process.exit(1);
}
ok("Remote migrations applied");

// 4. JWT_SECRET
banner("Set JWT_SECRET (Workers secret)");
const setSecret = await ask(
  "Generate a fresh JWT_SECRET and store it as a Workers secret? (Y/n)",
  "y"
);
if (setSecret.toLowerCase().startsWith("y")) {
  const secret = randomBytes(48).toString("base64url");
  log("Calling: npx wrangler secret put JWT_SECRET");
  const r = spawnSync("npx", ["wrangler", "secret", "put", "JWT_SECRET"], {
    cwd: workerDir,
    stdio: ["pipe", "inherit", "inherit"],
    shell: process.platform === "win32",
    input: secret + "\n",
  });
  if (r.status !== 0) {
    err("Failed to set JWT_SECRET. Run manually:");
    console.log(`     cd worker && npx wrangler secret put JWT_SECRET`);
    process.exit(1);
  }
  ok("JWT_SECRET stored");
} else {
  warn(
    `Skipped. Make sure it is already set: ${C.cyan}cd worker && npx wrangler secret list${C.reset}`
  );
}

// 5. Build the dashboard
banner("Build dashboard (Vite -> web/dist)");
log("Running: npm --workspace web run build");
const b = spawnSync("npm", ["--workspace", "web", "run", "build"], {
  cwd: root,
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (b.status !== 0) {
  err("Frontend build failed. Fix the errors above and re-run.");
  process.exit(1);
}
ok("Dashboard built");

// 6. Deploy
banner("Deploy Worker (UI + API)");
log("Running: npx wrangler deploy");
const d = run("npx", ["wrangler", "deploy"], { capture: true });
if (d.stdout) process.stdout.write(d.stdout);
if (d.stderr) process.stderr.write(d.stderr);
if (d.status !== 0) {
  err("Deploy failed.");
  process.exit(1);
}
const urlMatch = (d.stdout || "").match(/https:\/\/[\w.-]+\.workers\.dev/);
const workerUrl = urlMatch?.[0] ?? null;
ok(`Worker deployed${workerUrl ? `:  ${C.cyan}${workerUrl}${C.reset}` : ""}`);

// 7. Bootstrap admin
if (workerUrl) {
  banner("Bootstrap Production Admin");
  const doBootstrap = await ask("Create the first admin now? (Y/n)", "y");
  if (doBootstrap.toLowerCase().startsWith("y")) {
    const username = await ask("Admin username", "admin");
    let password = "";
    while (password.length < 8) {
      password = await ask("Admin password (>= 8 chars)");
      if (password.length < 8) warn("Too short, try again.");
    }
    log("POST /api/admin/bootstrap ...");
    try {
      const res = await fetch(`${workerUrl}/api/admin/bootstrap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.ok !== false) {
        ok(`Admin "${username}" created`);
      } else if (res.status === 409) {
        warn("An admin already exists. Skipping bootstrap.");
      } else {
        warn(`HTTP ${res.status}: ${data?.error ?? "unknown error"}`);
      }
    } catch (e) {
      warn(`Bootstrap call failed: ${e.message}`);
    }
  }
}

banner("Done");
console.log(`
Open the dashboard at:
  ${workerUrl ? C.cyan + workerUrl + C.reset : "(see deploy output above)"}

To re-deploy after code changes:
  ${C.cyan}npm run deploy${C.reset}            # build + wrangler deploy
  ${C.cyan}npm run deploy:worker${C.reset}     # wrangler deploy only (no rebuild)

Tail production logs:
  ${C.cyan}npx --workspace worker wrangler tail${C.reset}
`);
