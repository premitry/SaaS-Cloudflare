// Shared TypeScript types between worker (backend) and web (frontend).

export type AdminUser = {
  id: number;
  username: string;
  created_at: string;
};

export type CfAccount = {
  id: number;
  name: string;
  email: string | null;
  api_type: "token";
  // api_token never returned to the frontend
  created_at: string;
  domain_count?: number;
};

export type Domain = {
  id: number;
  cf_account_id: number;
  zone_id: string;
  domain: string;
  status?: string | null;
  cf_account_name?: string;
};

export type Permission = {
  user_id: number;
  can_dns: 0 | 1;
  can_email: 0 | 1;
  can_domain_settings: 0 | 1;
  can_full_access: 0 | 1;
};

export type PanelUser = {
  id: number;
  cf_account_id: number;
  login_code: string;
  note: string | null;
  role: "user";
  expired_at: string | null;
  is_permanent: 0 | 1;
  created_at: string;
  domains?: Domain[];
  permissions?: Omit<Permission, "user_id">;
  status?: "active" | "expired";
};

export type AuditLog = {
  id: number;
  cf_account_id: number | null;
  user_id: number | null;
  actor_type: "admin" | "user";
  action: string;
  target: string | null;
  ip_address: string | null;
  created_at: string;
};

// Cloudflare API surface (subset)
export type CfDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  comment?: string | null;
};

export type EmailRoutingSettings = {
  enabled: boolean;
  status: string;
  catch_all?: { enabled: boolean; destination?: string | null };
};

export type EmailRoutingRule = {
  id: string;
  name?: string;
  enabled: boolean;
  matchers: Array<{ type: string; field?: string; value?: string }>;
  actions: Array<{ type: string; value?: string[] }>;
};

export type EmailDestination = {
  email: string;
  verified: boolean;
};

export type DomainSettings = {
  ssl: string; // off | flexible | full | strict
  always_use_https: "on" | "off";
};

// Auth payloads
export type AdminLoginRequest = { username: string; password: string };
export type UserLoginRequest = { code: string };
export type LoginResponse = {
  token: string;
  expires_at: string;
  actor:
    | { type: "admin"; id: number; username: string }
    | { type: "user"; id: number; login_code: string };
};

// Generic API envelope
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string; details?: unknown };
export type ApiResponse<T> = ApiOk<T> | ApiErr;
