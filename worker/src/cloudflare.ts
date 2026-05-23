// Thin wrapper around the Cloudflare API.
// All calls expect a scoped API token (Bearer auth).

const CF_API = "https://api.cloudflare.com/client/v4";

export class CloudflareApiError extends Error {
  status: number;
  errors: unknown;
  constructor(status: number, message: string, errors?: unknown) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function cfFetch<T = unknown>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
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

// ---- token verification ----
export async function verifyToken(token: string): Promise<{
  id: string;
  status: string;
}> {
  return cfFetch(token, "/user/tokens/verify");
}

// ---- accounts (best-effort, used to capture account_id) ----
export type CfAccount = { id: string; name: string };
export async function listAccounts(token: string): Promise<CfAccount[]> {
  return cfFetch(token, "/accounts?per_page=50");
}

// ---- zones / domains ----
export type CfZone = {
  id: string;
  name: string;
  status: string;
  account: { id: string; name: string };
};

export async function listZones(token: string): Promise<CfZone[]> {
  // paginated; pull up to 1000 zones
  const out: CfZone[] = [];
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = (await cfFetch<CfZone[]>(
      token,
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

export async function getZone(token: string, zoneId: string) {
  return cfFetch(token, `/zones/${zoneId}`);
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
  token: string,
  zoneId: string
): Promise<CfDnsRecord[]> {
  return cfFetch(token, `/zones/${zoneId}/dns_records?per_page=200`);
}

export async function createDnsRecord(
  token: string,
  zoneId: string,
  body: Partial<CfDnsRecord>
): Promise<CfDnsRecord> {
  return cfFetch(token, `/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateDnsRecord(
  token: string,
  zoneId: string,
  recordId: string,
  body: Partial<CfDnsRecord>
): Promise<CfDnsRecord> {
  return cfFetch(token, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteDnsRecord(
  token: string,
  zoneId: string,
  recordId: string
): Promise<{ id: string }> {
  return cfFetch(token, `/zones/${zoneId}/dns_records/${recordId}`, {
    method: "DELETE",
  });
}

// ---- Email Routing ----
export async function getRoutingSettings(token: string, zoneId: string) {
  return cfFetch(token, `/zones/${zoneId}/email/routing`);
}

export async function enableRouting(token: string, zoneId: string) {
  return cfFetch(token, `/zones/${zoneId}/email/routing/enable`, {
    method: "POST",
    body: "{}",
  });
}

export async function disableRouting(token: string, zoneId: string) {
  return cfFetch(token, `/zones/${zoneId}/email/routing/disable`, {
    method: "POST",
    body: "{}",
  });
}

export async function listRoutingRules(token: string, zoneId: string) {
  return cfFetch(token, `/zones/${zoneId}/email/routing/rules?per_page=100`);
}

export async function createRoutingRule(
  token: string,
  zoneId: string,
  body: unknown
) {
  return cfFetch(token, `/zones/${zoneId}/email/routing/rules`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateRoutingRule(
  token: string,
  zoneId: string,
  ruleId: string,
  body: unknown
) {
  return cfFetch(token, `/zones/${zoneId}/email/routing/rules/${ruleId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteRoutingRule(
  token: string,
  zoneId: string,
  ruleId: string
) {
  return cfFetch(token, `/zones/${zoneId}/email/routing/rules/${ruleId}`, {
    method: "DELETE",
  });
}

export async function getCatchAllRule(token: string, zoneId: string) {
  return cfFetch(token, `/zones/${zoneId}/email/routing/rules/catch_all`);
}

export async function updateCatchAllRule(
  token: string,
  zoneId: string,
  body: unknown
) {
  return cfFetch(token, `/zones/${zoneId}/email/routing/rules/catch_all`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function listDestinations(token: string, accountId: string) {
  return cfFetch(
    token,
    `/accounts/${accountId}/email/routing/addresses?per_page=100`
  );
}

export async function createDestination(
  token: string,
  accountId: string,
  email: string
) {
  return cfFetch(token, `/accounts/${accountId}/email/routing/addresses`, {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function deleteDestination(
  token: string,
  accountId: string,
  destId: string
) {
  return cfFetch(
    token,
    `/accounts/${accountId}/email/routing/addresses/${destId}`,
    { method: "DELETE" }
  );
}

// ---- Zone settings ----
export async function getZoneSetting(
  token: string,
  zoneId: string,
  setting: string
) {
  return cfFetch(token, `/zones/${zoneId}/settings/${setting}`);
}

export async function patchZoneSetting(
  token: string,
  zoneId: string,
  setting: string,
  value: unknown
) {
  return cfFetch(token, `/zones/${zoneId}/settings/${setting}`, {
    method: "PATCH",
    body: JSON.stringify({ value }),
  });
}

export async function purgeCache(
  token: string,
  zoneId: string,
  body: { purge_everything?: boolean; files?: string[] }
) {
  return cfFetch(token, `/zones/${zoneId}/purge_cache`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
