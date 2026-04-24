/**
 * Provider plumbing — normalized result schema, error taxonomy, HTTP helper.
 *
 * Uses native `fetch` (Node 18+, Bun) — no http library deps.
 */

import { normalizeUrl, redactUrl } from "../_url.js";

// --- Normalized shapes ----------------------------------------------------

export interface NormalizedResultInit {
  url: string;
  title: string;
  snippet?: string;
  score?: number | null;
  publishedAt?: string | null;
  sourceKind?: "doc" | "web" | "paper" | "code" | "company";
  provider: string;
  raw?: unknown;
  corroboratedBy?: string[];
}

export class NormalizedResult {
  url: string;
  title: string;
  snippet: string;
  score: number | null;
  publishedAt: string | null;
  sourceKind: "doc" | "web" | "paper" | "code" | "company";
  provider: string;
  urlNormalized: string;
  corroboratedBy: string[];
  raw?: unknown;

  constructor(init: NormalizedResultInit) {
    this.url = init.url;
    this.title = init.title ?? "";
    this.snippet = init.snippet ?? "";
    this.score = init.score ?? null;
    this.publishedAt = init.publishedAt ?? null;
    this.sourceKind = init.sourceKind ?? "web";
    this.provider = init.provider;
    this.raw = init.raw;
    this.corroboratedBy = init.corroboratedBy ?? [];
    try {
      this.urlNormalized = init.url ? normalizeUrl(init.url) : "";
    } catch {
      this.urlNormalized = init.url ?? "";
    }
  }

  toJSON(includeRaw = false): Record<string, unknown> {
    const d: Record<string, unknown> = {
      url: redactUrl(this.url),
      title: this.title,
      snippet: this.snippet,
      score: this.score,
      published_at: this.publishedAt,
      source_kind: this.sourceKind,
      provider: this.provider,
      url_normalized: redactUrl(this.urlNormalized),
    };
    if (this.corroboratedBy.length > 0) d.corroborated_by = this.corroboratedBy;
    if (includeRaw) d.raw = this.raw;
    return d;
  }
}

export interface FetchedPageInit {
  url: string;
  title?: string;
  markdown?: string;
  html?: string | null;
  metadata?: Record<string, unknown>;
  provider: string;
  fetchedAt?: string | null;
  status?: "ok" | "degraded" | "error";
}

export class FetchedPage {
  url: string;
  title: string;
  markdown: string;
  html: string | null;
  metadata: Record<string, unknown>;
  provider: string;
  fetchedAt: string | null;
  urlNormalized: string;
  status: "ok" | "degraded" | "error";

  constructor(init: FetchedPageInit) {
    this.url = init.url;
    this.title = init.title ?? "";
    this.markdown = init.markdown ?? "";
    this.html = init.html ?? null;
    this.metadata = init.metadata ?? {};
    this.provider = init.provider;
    this.fetchedAt = init.fetchedAt ?? null;
    this.status = init.status ?? "ok";
    try {
      this.urlNormalized = init.url ? normalizeUrl(init.url) : "";
    } catch {
      this.urlNormalized = init.url ?? "";
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      url: redactUrl(this.url),
      title: this.title,
      markdown: this.markdown,
      metadata: this.metadata,
      provider: this.provider,
      fetched_at: this.fetchedAt,
      url_normalized: this.urlNormalized,
      status: this.status,
    };
  }
}

// --- Error taxonomy -------------------------------------------------------

export type ProviderErrorKind =
  | "provider_error"
  | "transport_error"
  | "rate_limit"
  | "auth_error"
  | "missing_key"
  | "disabled";

export class ProviderError extends Error {
  kind: ProviderErrorKind;
  retryable: boolean;
  status: number | null;
  constructor(message: string, opts: { kind?: ProviderErrorKind; retryable?: boolean; status?: number | null } = {}) {
    super(message);
    this.name = "ProviderError";
    this.kind = opts.kind ?? "provider_error";
    this.retryable = opts.retryable ?? false;
    this.status = opts.status ?? null;
  }
}

export class TransportError extends ProviderError {
  constructor(message: string) {
    super(message, { kind: "transport_error", retryable: true });
    this.name = "TransportError";
  }
}

export class RateLimitError extends ProviderError {
  retryAfter: number | null;
  constructor(message: string, retryAfter: number | null = null) {
    super(message, { kind: "rate_limit", retryable: true, status: 429 });
    this.name = "RateLimitError";
    this.retryAfter = retryAfter;
  }
}

export class AuthError extends ProviderError {
  constructor(message: string) {
    super(message, { kind: "auth_error", retryable: false, status: 401 });
    this.name = "AuthError";
  }
}

export class MissingKeyError extends ProviderError {
  provider: string;
  constructor(provider: string) {
    super(`${provider}: API key not configured`, { kind: "missing_key" });
    this.name = "MissingKeyError";
    this.provider = provider;
  }
}

export class DisabledError extends ProviderError {
  provider: string;
  constructor(provider: string) {
    super(`${provider}: provider is disabled (wsc config enable ${provider} to undo)`, { kind: "disabled" });
    this.name = "DisabledError";
    this.provider = provider;
  }
}

// --- safe_get -------------------------------------------------------------

export function safeGet<T = unknown>(payload: unknown, path: Array<string | number>, fallback?: T): T | undefined {
  let val: unknown = payload;
  for (const key of path) {
    if (val == null) return fallback;
    if (typeof key === "number") {
      if (!Array.isArray(val) || key >= val.length) return fallback;
      val = val[key];
    } else {
      if (typeof val !== "object") return fallback;
      val = (val as Record<string, unknown>)[key];
    }
  }
  return (val ?? fallback) as T | undefined;
}

// --- HTTP -----------------------------------------------------------------

export interface HttpRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, string>;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: unknown;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const USER_AGENT = "wsc/0.2 (+https://github.com/heggria/web-surfing-cli)";

export async function httpRequest(url: string, opts: HttpRequestOptions = {}): Promise<HttpResponse> {
  const method = opts.method ?? "GET";
  const headers: Record<string, string> = { "user-agent": USER_AGENT, ...lowerKeys(opts.headers ?? {}) };

  let finalUrl = url;
  if (opts.params) {
    const u = new URL(url);
    for (const [k, v] of Object.entries(opts.params)) u.searchParams.set(k, v);
    finalUrl = u.toString();
  }

  let body: string | Uint8Array | undefined;
  if (opts.body !== undefined && opts.body !== null) {
    if (typeof opts.body === "string" || opts.body instanceof Uint8Array) {
      body = opts.body;
    } else {
      body = JSON.stringify(opts.body);
      if (!("content-type" in headers)) headers["content-type"] = "application/json";
    }
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(finalUrl, { method, headers, body, signal: ctrl.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new TransportError(`${finalUrl}: request timed out`);
    }
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new TransportError(`${finalUrl}: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  const respHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => {
    respHeaders[k.toLowerCase()] = v;
  });

  if (response.status >= 200 && response.status < 300) {
    return { status: response.status, headers: respHeaders, text, json };
  }

  if (response.status === 429) {
    const ra = respHeaders["retry-after"];
    const retryAfter = ra ? Number.parseFloat(ra) : null;
    throw new RateLimitError(`${finalUrl}: HTTP 429 rate limit`, Number.isFinite(retryAfter as number) ? (retryAfter as number) : null);
  }
  if (response.status === 401 || response.status === 403) {
    throw new AuthError(`${finalUrl}: HTTP ${response.status} ${response.statusText}`);
  }
  throw new ProviderError(
    `${finalUrl}: HTTP ${response.status} ${response.statusText} body=${JSON.stringify(text.slice(0, 200))}`,
    { status: response.status },
  );
}

function lowerKeys(obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) out[k.toLowerCase()] = v;
  return out;
}

// --- Marker base class ----------------------------------------------------

export abstract class Provider {
  abstract name: string;
  abstract schemaVersion: string;
}
