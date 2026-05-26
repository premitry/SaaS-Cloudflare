#!/usr/bin/env node
// Guided frontend deploy to Cloudflare Pages.
// Usage:  npm run deploy:web
//
// Steps:
// 1. Verifies wrangler is logged in
// 2. Asks for the worker URL (NEXT_PUBLIC_API_URL) and saves it
// 3. Builds Next.js for Cloudflare Pages via @cloudflare/next-on-pages
// 4. Runs `wrangler pages deploy .vercel/output/static --project-name=<name>`
// 5. Prints the dashboard URL

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import readline from "node:readline";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const webDir = resolve(root, "web");

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
    ...opts,
  });
}

// ---- 1. Banner ----
banner("Cloudflare Domain Panel - Deploy Frontend (Cloudflare Pages)");

// ---- 2. wrangler login ----
log("Checking wrangler authentication...");
const whoami = run("npx", ["wrangler", "whoami"], { capture: true, cwd: webDir });
if (whoami.status !== 0) {
  err("Not logged in to Cloudflare.");
  console.log(`     Run: ${C.cyan}npx wrangler login${C.reset}`);
  process.exit(1);
}
const emailMatch = (whoami.stdout || "").match(/[\w.\-+]+@[\w.\-]+/);
ok(`Authenticated as ${emailMatch?.[0] ?? "(account)"}`);

// ---- 3. node_modules check ----
if (!existsSync(resolve(webDir, "node_modules"))) {
  warn("web/node_modules is missing. Installing...");
  const r = run("npm", ["install"], { cwd: webDir });
  if (r.status !== 0) {
    err("npm install failed");
    process.exit(1);
  }
}

// ---- 4. API URL ----
banner("Worker API URL");
const envLocalPath = resolve(webDir, ".env.local");
let currentApi = "";
if (existsSync(envLocalPath)) {
  const m = readFileSync(envLocalPath, "utf8").match(
    /NEXT_PUBLIC_API_URL\s*=\s*(.+)/
  );
  if (m) currentApi = m[1].trim().replace(/^["']|["']$/g, "");
}
console.log(`  Current: ${currentApi || "(not set)"}`);
console.log(
  `  ${C.dim}This is the worker URL (e.g. https://cfp-worker.<sub>.workers.dev),${C.reset}`
);
console.log(
  `  ${C.dim}printed at the end of \`npm run deploy:setup\`.${C.reset}`
);
const apiUrl = await ask(
  "Worker URL the dashboard will call",
  currentApi && !currentApi.includes("127.0.0.1") && !currentApi.includes("localhost")
    ? currentApi
    : ""
);
if (!apiUrl) {
  err("API URL is required. Run `npm run deploy:setup` first to deploy the worker.");
  process.exit(1);
}

// Persist into web/.env.local so the build picks it up
let envText = existsSync(envLocalPath)
  ? readFileSync(envLocalPath, "utf8")
  : "";
if (envText.match(/NEXT_PUBLIC_API_URL\s*=/m)) {
  envText = envText.replace(
    /NEXT_PUBLIC_API_URL\s*=.*/m,
    `NEXT_PUBLIC_API_URL=${apiUrl}`
  );
} else {
  envText = (envText.trimEnd() + `\nNEXT_PUBLIC_API_URL=${apiUrl}\n`).trimStart();
}
writeFileSync(envLocalPath, envText);
ok(`Saved NEXT_PUBLIC_API_URL=${apiUrl}`);

// ---- 5. Build with @cloudflare/next-on-pages ----
banner("Build (Next.js -> Cloudflare Pages)");
log("Running: npx @cloudflare/next-on-pages");
const buildEnv = {
  ...process.env,
  NEXT_PUBLIC_API_URL: apiUrl,
};
const b = spawnSync("npx", ["@cloudflare/next-on-pages"], {
  cwd: webDir,
  stdio: "inherit",
  shell: process.platform === "win32",
  env: buildEnv,
});
if (b.status !== 0) {
  err("Build failed.");
  console.log(
    `     Try: ${C.cyan}cd web && npm install${C.reset} and re-run.`
  );
  process.exit(1);
}
const outDir = resolve(webDir, ".vercel/output/static");
if (!existsSync(outDir)) {
  err(`Build output not found at ${outDir}`);
  process.exit(1);
}
ok("Build complete -> web/.vercel/output/static");

// ---- 6. Deploy to Cloudflare Pages ----
banner("Deploy: wrangler pages deploy");
const projectName = await ask(
  "Cloudflare Pages project name (created on first deploy)",
  "cfp-web"
);
log(
  `Running: npx wrangler pages deploy .vercel/output/static --project-name=${projectName}`
);
const d = run(
  "npx",
  [
    "wrangler",
    "pages",
    "deploy",
    ".vercel/output/static",
    `--project-name=${projectName}`,
    "--commit-dirty=true",
  ],
  { cwd: webDir }
);
if (d.status !== 0) {
  err("Deploy failed.");
  process.exit(1);
}
ok("Deployed!");

// ---- 7. Done ----
banner("Done");
console.log(`
Your dashboard:
  ${C.cyan}https://${projectName}.pages.dev${C.reset}

Next steps:

  1. Open the URL above and log in at ${C.cyan}/admin/login${C.reset}.
  2. If you haven't created the production admin yet, run:
       ${C.cyan}npm run deploy:setup${C.reset}      (the worker setup wizard does this)

  3. To attach a custom domain:
       Cloudflare dashboard -> Workers & Pages -> ${projectName} -> Custom domains
     Then update ${C.cyan}ALLOWED_ORIGINS${C.reset} in worker/wrangler.toml and:
       ${C.cyan}npm run deploy:worker${C.reset}

To re-deploy this dashboard later:
  ${C.cyan}npm run deploy:web${C.reset}
`);
