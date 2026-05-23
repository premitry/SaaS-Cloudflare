// Misc small helpers

import type { Context } from "hono";

export function getClientIp(c: Context): string | null {
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    c.req.header("X-Real-IP") ||
    null
  );
}

export function jsonOk<T>(data: T) {
  return { ok: true as const, data };
}

export function jsonErr(error: string, details?: unknown) {
  return { ok: false as const, error, details };
}

// Generate a login code in the form PREFIX-XXXXX
export function generateLoginCode(prefix = "USER"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/I/1
  const buf = new Uint8Array(5);
  crypto.getRandomValues(buf);
  let s = "";
  for (let i = 0; i < buf.length; i++) {
    s += alphabet[buf[i] % alphabet.length];
  }
  return `${prefix.toUpperCase()}-${s}`;
}

export function safePrefix(input: string | undefined): string {
  if (!input) return "USER";
  const cleaned = input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
  return cleaned || "USER";
}

export function nowIso(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

export function addDaysIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().replace("T", " ").slice(0, 19);
}
