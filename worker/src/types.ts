// Worker-internal types (Cloudflare bindings, request context)

export type Env = {
  DB: D1Database;
  JWT_SECRET: string;
  ALLOWED_ORIGINS?: string;
  ASSETS?: Fetcher; // [assets] binding -- serves the dashboard UI
};

export type AdminActor = {
  type: "admin";
  id: number;
  username: string;
};

export type UserActor = {
  type: "user";
  id: number;
  cf_account_id: number;
  login_code: string;
};

export type Actor = AdminActor | UserActor;

// Hono variables map
export type Variables = {
  actor: Actor;
};
