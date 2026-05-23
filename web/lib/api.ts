// Tiny typed fetch wrapper for the worker API.

const API_URL =
  (typeof window !== "undefined"
    ? (window as unknown as { __API_URL?: string }).__API_URL
    : undefined) ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://127.0.0.1:8787";

export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string; details?: unknown };
export type ApiResponse<T> = ApiOk<T> | ApiErr;

const TOKEN_KEY = "cfp_token";
const ACTOR_KEY = "cfp_actor";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearAuth(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(ACTOR_KEY);
}

export type StoredActor =
  | { type: "admin"; id: number; username: string }
  | { type: "user"; id: number; login_code: string };

export function getActor(): StoredActor | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ACTOR_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredActor;
  } catch {
    return null;
  }
}
export function setActor(actor: StoredActor): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTOR_KEY, JSON.stringify(actor));
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    json = null;
  }
  if (!json) {
    throw new ApiError(res.status, `HTTP ${res.status}`);
  }
  if (json.ok === false) {
    if (res.status === 401) {
      clearAuth();
      if (typeof window !== "undefined") {
        // gentle redirect
        const cur = window.location.pathname;
        if (!cur.startsWith("/login") && !cur.startsWith("/admin/login")) {
          window.location.href = cur.startsWith("/admin") ? "/admin/login" : "/login";
        }
      }
    }
    throw new ApiError(res.status, json.error, json.details);
  }
  return json.data;
}

export const api = {
  get: <T>(p: string) => request<T>(p, { method: "GET" }),
  post: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "POST", body: body ? JSON.stringify(body) : "{}" }),
  put: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PUT", body: body ? JSON.stringify(body) : "{}" }),
  patch: <T>(p: string, body?: unknown) =>
    request<T>(p, { method: "PATCH", body: body ? JSON.stringify(body) : "{}" }),
  del: <T>(p: string) => request<T>(p, { method: "DELETE" }),
};

// Endpoint wrappers
export type LoginResp = {
  token: string;
  expires_at: string;
  actor: StoredActor;
};
export const auth = {
  adminLogin: (username: string, password: string) =>
    api.post<LoginResp>("/api/admin/login", { username, password }),
  userLogin: (code: string) => api.post<LoginResp>("/api/login", { code }),
  me: () => api.get<unknown>("/api/me"),
  changePassword: (current_password: string, new_password: string) =>
    api.post("/api/admin/change-password", { current_password, new_password }),
};
