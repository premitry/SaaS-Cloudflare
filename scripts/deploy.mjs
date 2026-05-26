#!/usr/bin/env node
// Guided production deployment to Cloudflare Workers.
// Usage:  npm run deploy:setup
//
// Steps:
// 1. Verifies wrangler is logged in
// 2. Verifies worker/wrangler.toml has a real database_id
// 3. Applies migrations to remote D1
// 4. Sets JWT_SECRET as a Workers secret (auto-generates a strong one)
// 5. Asks for frontend URL and updates ALLOWED_ORIGINS in wrangler.toml
// 6. Deploys the worker
// 7. Optionally bootstraps the production admin via curl

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

// ---------- 1. Banner ----------
banner("Cloudflare Domain Panel - Production Deploy");

// ---------- 2. wrangler login ----------
log("Checking wrangler authentication...");
const whoami = run("npx", ["wrangler", "whoami"], { capture: true });
if (whoami.status !== 0) {
  err("Not logged in to Cloudflare.");
  console.log(`     Run: ${C.cyan}npx wrangler login${C.reset}`);
  process.exit(1);
}
const emailMatch = (whoami.stdout || "").match(/[\w.\-+]+@[\w.\-]+/);
ok(`Authenticated as ${emailMatch?.[0] ?? "(account)"}`);

// ---------- 3. Verify wrangler.toml ----------
const tomlPath = resolve(workerDir, "wrangler.toml");
if (!existsSync(tomlPath)) {
  err("worker/wrangler.toml not found.");
  console.log(`     Run: ${C.cyan}npm run setup${C.reset} first`);
  process.exit(1);
}
let toml = readFileSync(tomlPath, "utf8");
if (toml.includes("REPLACE_WITH_YOUR_D1_DATABASE_ID")) {
  err("D1 database_id is not set in worker/wrangler.toml.");
  console.log(`     Run: ${C.cyan}npm run setup${C.reset} first`);
  process.exit(1);
}
const dbIdMatch = toml.match(/database_id\s*=\s*"([^"]+)"/);
ok(`D1 database_id = ${dbIdMatch?.[1] ?? "(unknown)"}`);

// ---------- 4. Remote migrations ----------
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

// ---------- 5. JWT_SECRET ----------
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

// ---------- 6. CORS ----------
banner("CORS Allowlist (frontend URL)");
const currentOrigins =
  (toml.match(/ALLOWED_ORIGINS\s*=\s*"([^"]+)"/) || [])[1] || "";
console.log(`  Current: ${currentOrigins || "(not set)"}`);
console.log(
  `  ${C.dim}This must be the URL where your dashboard is hosted (https).${C.reset}`
);
const newOrigins = await ask(
  "Frontend URL(s), comma-separated",
  currentOrigins && currentOrigins !== "http://localhost:3000"
    ? currentOrigins
    : "https://your-frontend.example.com"
);
if (newOrigins && newOrigins !== currentOrigins) {
  if (toml.match(/ALLOWED_ORIGINS\s*=\s*"[^"]*"/)) {
    toml = toml.replace(
      /ALLOWED_ORIGINS\s*=\s*"[^"]*"/,
      `ALLOWED_ORIGINS = "${newOrigins}"`
    );
  } else {
    toml += `\n[vars]\nALLOWED_ORIGINS = "${newOrigins}"\n`;
  }
  writeFileSync(tomlPath, toml);
  ok(`Set ALLOWED_ORIGINS = "${newOrigins}"`);
} else {
  ok("ALLOWED_ORIGINS unchanged");
}

// ---------- 7. Deploy ----------
banner("Deploy Worker");
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

// ---------- 8. Bootstrap admin ----------
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
      console.log(`     You can run it manually:
       curl -X POST ${workerUrl}/api/admin/bootstrap \\
         -H "Content-Type: application/json" \\
         -d '{"username":"${username}","password":"<your-password>"}'`);
    }
  }
}

// ---------- Done ----------
banner("Done");
console.log(`
Worker URL:    ${workerUrl ? C.cyan + workerUrl + C.reset : "(see deploy output above)"}

Next steps for the dashboard frontend:

  1. Set the API URL in your hosting platform's env:
       ${C.cyan}NEXT_PUBLIC_API_URL=${workerUrl ?? "<your-worker-url>"}${C.reset}

  2. Build:
       ${C.cyan}npm run build:web${C.reset}

  3. Deploy on Cloudflare Pages:
       ${C.cyan}npx wrangler pages deploy web/.next --project-name=cfp-web${C.reset}

     ...or on Vercel:
       ${C.cyan}cd web && npx vercel --prod${C.reset}

  4. Open the dashboard and log in at /admin/login.

To re-deploy the worker only (no setup steps):
  ${C.cyan}npm run deploy:worker${C.reset}

To tail production logs:
  ${C.cyan}npx --workspace worker wrangler tail${C.reset}
`);
