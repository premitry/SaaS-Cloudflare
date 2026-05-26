// Tiny typed fetch wrapper for the worker API.
// In production, the dashboard and the worker are served from the SAME origin,
// so we use relative paths. In dev, vite proxies /api/* to the worker (see vite.config.ts).

const API_BASE = ""; // same-origin

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
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearAuth(): void {
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

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch (e) {
    throw new NetworkError(
      `cannot reach API: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  let json: ApiResponse<T> | null = null;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    json = null;
  }
  if (!json) {
    throw new ApiError(res.status, `HTTP ${res.status} (no JSON body)`);
  }
  if (json.ok === false) {
    if (res.status === 401) {
      clearAuth();
      const cur = window.location.pathname;
      if (!cur.startsWith("/login") && !cur.startsWith("/admin/login")) {
        window.location.href = cur.startsWith("/admin")
          ? "/admin/login"
          : "/login";
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

export function formatError(e: unknown): string {
  if (e instanceof NetworkError) return `${e.message}.`;
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return "Unknown error";
}

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

export type Diag = {
  has_db: boolean;
  has_jwt_secret: boolean;
  allowed_origins: string;
  db_ready?: boolean;
  db_error?: string;
  admin_count?: number;
};
export const diag = {
  check: () => api.get<Diag>("/api/_diag"),
};
