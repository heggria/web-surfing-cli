/**
 * URL helpers — redaction and normalization.
 *
 * Lives in its own module so audit.ts and providers/* can import it
 * without dragging in either side's surface area.
 */

const SECRET_KEYS = new Set(
  [
    "token",
    "tokens",
    "access_token",
    "id_token",
    "refresh_token",
    "auth",
    "authkey",
    "apikey",
    "api_key",
    "api-key",
    "x-api-key",
    "key",
    "secret",
    "client_secret",
    "sig",
    "signature",
    "hmac",
    "session",
    "sessionid",
    "password",
    "passwd",
    "pwd",
  ].map((s) => s.toLowerCase()),
);

const TRACKING_KEYS = new Set(
  [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "utm_id",
    "gclid",
    "fbclid",
    "mc_cid",
    "mc_eid",
    "ref",
    "_hsenc",
    "_hsmi",
  ].map((s) => s.toLowerCase()),
);

/**
 * Replace secret query values with `***` while leaving normal params intact.
 * Returns the input unchanged for empty / non-URL strings rather than throwing
 * so call sites can apply this defensively before logging.
 */
export function redactUrl(url: string): string {
  if (!url || !url.includes("://")) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (!u.search) return url;
  let mutated = false;
  for (const k of Array.from(u.searchParams.keys())) {
    if (SECRET_KEYS.has(k.toLowerCase())) {
      u.searchParams.set(k, "***");
      mutated = true;
    }
  }
  return mutated ? u.toString() : url;
}

/**
 * Canonical form for dedup keys: lowercase host, default-port stripped (URL
 * does this automatically), no fragment, tracking query params dropped,
 * remaining params sorted for stability. Path case is preserved (paths are
 * case-sensitive on most servers).
 */
export function normalizeUrl(
  url: string,
  opts: { dropTracking?: boolean } = {},
): string {
  const dropTracking = opts.dropTracking ?? true;
  if (!url || !url.includes("://")) return url;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  u.hash = "";
  u.username = "";
  u.password = "";
  if (dropTracking) {
    for (const k of Array.from(u.searchParams.keys())) {
      if (TRACKING_KEYS.has(k.toLowerCase())) u.searchParams.delete(k);
    }
  }
  // Stable sort of remaining params.
  const entries = Array.from(u.searchParams.entries()).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  // Rebuild search.
  u.search = "";
  for (const [k, v] of entries) u.searchParams.append(k, v);
  // Force scheme + host lowercase (URL already does this, but be explicit).
  return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${u.pathname}${u.search}`;
}

export function redactEach(urls: readonly string[]): string[] {
  return urls.map((u) => redactUrl(u));
}
