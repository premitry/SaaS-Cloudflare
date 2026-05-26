// Thin wrapper around the Cloudflare API.
// Supports two auth modes:
//   - "token":  Authorization: Bearer <api_token>          (scoped API token)
//   - "global": X-Auth-Email + X-Auth-Key                  (Global API Key)

const CF_API = "https://api.cloudflare.com/client/v4";

export type CfAuth =
  | { type: "token"; token: string }
  | { type: "global"; email: string; key: string };

export class CloudflareApiError extends Error {
  status: number;
  errors: unknown;
  constructor(status: number, message: string, errors?: unknown) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

function applyAuthHeaders(headers: Headers, auth: CfAuth): void {
  if (auth.type === "token") {
    headers.set("Authorization", `Bearer ${auth.token}`);
  } else {
    headers.set("X-Auth-Email", auth.email);
    headers.set("X-Auth-Key", auth.key);
  }
}

async function cfFetch<T = unknown>(
  auth: CfAuth,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  applyAuthHeaders(headers, auth);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${CF_API}${path}`, { ...init, headers });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    result?: unknown;
    errors?: unknown;
    messages?: unknown;
  };
  if (!res.ok || data.success === false) {
    const msg =
      Array.isArray(data.errors) && data.errors.length
        ? // @ts-expect-error - dynamic
          data.errors[0]?.message ?? "Cloudflare API error"
        : "Cloudflare API error";
    throw new CloudflareApiError(res.status, msg, data.errors);
  }
  return data.result as T;
}

// ---- credential verification ----

// Works for both auth modes. For API tokens we use /user/tokens/verify;
// for Global Key we hit /user since there is no token to verify.
export async function verifyAuth(auth: CfAuth): Promise<{ ok: true }> {
  if (auth.type === "token") {
    await cfFetch(auth, "/user/tokens/verify");
  } else {
    await cfFetch(auth, "/user");
  }
  return { ok: true };
}

// ---- accounts (best-effort, used to capture account_id) ----
export type CfAccount = { id: string; name: string };
export async function listAccounts(auth: CfAuth): Promise<CfAccount[]> {
  return cfFetch(auth, "/accounts?per_page=50");
}

// ---- zones / domains ----
export type CfZone = {
  id: string;
  name: string;
  status: string;
  account: { id: string; name: string };
};

export async function listZones(auth: CfAuth): Promise<CfZone[]> {
  // paginated; pull up to 1000 zones
  const out: CfZone[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = (await cfFetch<CfZone[]>(
      auth,
      `/zones?per_page=50&page=${page}`
    )) as unknown as CfZone[];
    if (!res || res.length === 0) break;
    out.push(...res);
    if (res.length < 50) break;
    page++;
    if (page > 20) break;
  }
  return out;
}

export async function getZone(auth: CfAuth, zoneId: string) {
  return cfFetch(auth, `/zones/${zoneId}`);
}

// ---- DNS records ----
export type CfDnsRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  ttl: number;
  proxied: boolean;
  comment?: string | null;
};

export async function listDnsRecords(
  auth: CfAuth,
  zoneId: string
): Promise<CfDnsRecord[]> {
  return cfFetch(auth, `/zones/${zoneId}/dns_records?per_page=200`);
}

export async function createDnsRecord(
  auth: CfAuth,
  zoneId: string,
  body: Partial<CfDnsRecord>
): Promise<CfDnsRecord> {
  return cfFetch(auth, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateDnsRecord(
  auth: CfAuth,
  zoneId: string,
  recordId: string,
  body: Partial<CfDnsRecord>
): Promise<CfDnsRecord> {
  return cfFetch(auth, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteDnsRecord(
  auth: CfAuth,
  zoneId: string,
  recordId: string
): Promise<{ id: string }> {
  return cfFetch(auth, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
  });
}

// ---- Email Routing ----
export async function getRoutingSettings(auth: CfAuth, zoneId: string) {
  return cfFetch(auth, `/zones/${zoneId}/email/routing`);
}

export async function enableRouting(auth: CfAuth, zoneId: string) {
  return cfFetch(auth, `/zones/${zoneId}/email/routing/enable`, {
    method: "POST",
    body: "{}",
  });
}

export async function disableRouting(auth: CfAuth, zoneId: string) {
  return cfFetch(auth, `/zones/${zoneId}/email/routing/disable`, {
    method: "POST",
    body: "{}",
  });
}

export async function listRoutingRules(auth: CfAuth, zoneId: string) {
  return cfFetch(auth, `/zones/${zoneId}/email/routing/rules?per_page=100`);
}

export async function createRoutingRule(
  auth: CfAuth,
  zoneId: string,
  body: unknown
) {
  return cfFetch(auth, `/zones/${zoneId}/email/routing/rules`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateRoutingRule(
  auth: CfAuth,
  zoneId: string,
  ruleId: string,
  body: unknown
) {
  return cfFetch(auth, `/zones/${zoneId}/email/routing/rules/${ruleId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteRoutingRule(
  auth: CfAuth,
  zoneId: string,
  ruleId: string
) {
  return cfFetch(auth, `/zones/${zoneId}/email/routing/rules/${ruleId}`, {
    method: "DELETE",
  });
}

export async function getCatchAllRule(auth: CfAuth, zoneId: string) {
  return cfFetch(auth, `/zones/${zoneId}/email/routing/rules/catch_all`);
}

export async function updateCatchAllRule(
  auth: CfAuth,
  zoneId: string,
  body: unknown
) {
  return cfFetch(auth, `/zones/${zoneId}/email/routing/rules/catch_all`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function listDestinations(auth: CfAuth, accountId: string) {
  return cfFetch(
    auth,
    `/accounts/${accountId}/email/routing/addresses?per_page=100`
  );
}

export async function createDestination(
  auth: CfAuth,
  accountId: string,
  email: string
) {
  return cfFetch(auth, `/accounts/${accountId}/email/routing/addresses`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function deleteDestination(
  auth: CfAuth,
  accountId: string,
  destId: string
) {
  return cfFetch(
    auth,
    `/accounts/${accountId}/email/routing/addresses/${destId}`,
    { method: "DELETE" }
  );
}

// ---- Zone settings ----
export async function getZoneSetting(
  auth: CfAuth,
  zoneId: string,
  setting: string
) {
  return cfFetch(auth, `/zones/${zoneId}/settings/${setting}`);
}

export async function patchZoneSetting(
  auth: CfAuth,
  zoneId: string,
  setting: string,
  value: unknown
) {
  return cfFetch(auth, `/zones/${zoneId}/settings/${setting}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

export async function purgeCache(
  auth: CfAuth,
  zoneId: string,
  body: { purge_everything?: boolean; files?: string[] }
) {
  return cfFetch(auth, `/zones/${zoneId}/purge_cache`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ---- helper: build a CfAuth from a DB row ----
export function authFromRow(row: {
  api_type: string | null;
  api_token: string;
  email: string | null;
}): CfAuth {
  if (row.api_type === "global") {
    if (!row.email) {
      throw new Error(
        "Global API Key auth requires an email but row.email is null"
      );
    }
    return { type: "global", email: row.email, key: row.api_token };
  }
  return { type: "token", token: row.api_token };
}
