#!/usr/bin/env node
// Run the worker and the Next.js web app in parallel with prefixed logs.
// Usage:  npm run dev
//
// Stops both on Ctrl+C.

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const C = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  yellow: "\x1b[33m",
};

function start(name, color, cmd, args, cwd) {
  const prefix = `${color}[${name}]${C.reset}`;
  const child = spawn(cmd, args, {
    cwd,
    shell: process.platform === "win32",
    env: process.env,
  });
  const pipe = (stream, target) => {
    let buf = "";
    stream.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        target.write(`${prefix} ${line}\n`);
      }
    });
  };
  pipe(child.stdout, process.stdout);
  pipe(child.stderr, process.stderr);
  child.on("exit", (code, signal) => {
    console.log(
      `${prefix} ${C.yellow}exited${C.reset} (code=${code ?? "-"}, signal=${signal ?? "-"})`
    );
    cleanup(code ?? 1);
  });
  return child;
}

const procs = [];

function cleanup(code = 0) {
  for (const p of procs) {
    try {
      p.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));

console.log(`${C.cyan}> Starting worker (8787) and web (3000)...${C.reset}`);

procs.push(
  start("worker", C.cyan, "npm", ["run", "dev"], resolve(root, "worker"))
);
procs.push(
  start("web   ", C.magenta, "npm", ["run", "dev"], resolve(root, "web"))
);
