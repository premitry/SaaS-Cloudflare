// Password hashing (PBKDF2-SHA-256) and JWT (HS256) using Web Crypto only.
// No third-party crypto deps -- everything runs natively on Workers.

const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_KEYLEN = 32; // 256 bits

const enc = new TextEncoder();
const dec = new TextDecoder();

// ---- base64url helpers ----
function bytesToB64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64ToBytes(s: string): Uint8Array {
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---- password hashing ----

export async function hashPassword(
  password: string,
  saltBytes?: Uint8Array
): Promise<{ hash: string; salt: string }> {
  const salt = saltBytes ?? crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    keyMaterial,
    PBKDF2_KEYLEN * 8
  );
  return {
    hash: bytesToB64(new Uint8Array(bits)),
    salt: bytesToB64(salt),
  };
}

export async function verifyPassword(
  password: string,
  storedHashB64: string,
  storedSaltB64: string
): Promise<boolean> {
  const salt = b64ToBytes(storedSaltB64);
  const { hash } = await hashPassword(password, salt);
  // constant time compare
  if (hash.length !== storedHashB64.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ storedHashB64.charCodeAt(i);
  }
  return diff === 0;
}

// ---- JWT (HS256) ----

export type JwtPayload = {
  sub: string;        // "admin:1" or "user:42"
  type: "admin" | "user";
  id: number;
  // user-specific binding so regenerating a code invalidates old tokens
  code?: string;
  username?: string;
  iat: number;
  exp: number;
};

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function signJwt(
  payload: Omit<JwtPayload, "iat" | "exp">,
  secret: string,
  ttlSeconds: number
): Promise<{ token: string; expiresAt: string }> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const full: JwtPayload = { ...payload, iat: now, exp: now + ttlSeconds };
  const headerB = bytesToB64Url(enc.encode(JSON.stringify(header)));
  const payloadB = bytesToB64Url(enc.encode(JSON.stringify(full)));
  const data = `${headerB}.${payloadB}`;
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  const sigB = bytesToB64Url(new Uint8Array(sig));
  return {
    token: `${data}.${sigB}`,
    expiresAt: new Date((now + ttlSeconds) * 1000).toISOString(),
  };
}

export async function verifyJwt(
  token: string,
  secret: string
): Promise<JwtPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB, payloadB, sigB] = parts;
  const data = `${headerB}.${payloadB}`;
  const key = await hmacKey(secret);
  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    b64UrlToBytes(sigB),
    enc.encode(data)
  );
  if (!ok) return null;
  try {
    const payload = JSON.parse(dec.decode(b64UrlToBytes(payloadB))) as JwtPayload;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
