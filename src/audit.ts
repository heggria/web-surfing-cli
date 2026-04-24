/**
 * Audit log — append-only JSONL receipts at ~/.local/state/wsc/audit.jsonl.
 *
 * - Concurrent writers serialize through `proper-lockfile` (works on macOS
 *   and Linux without flock-fragility).
 * - URL-bearing fields (url, source_url, urls, selected_urls) auto-redacted
 *   via `redactUrl`.
 * - `withCall(op, opts, fn)` is the equivalent of Python's `start_call` —
 *   allocates a UUID, captures duration, captures errors as status="error",
 *   writes the receipt on exit.
 * - Rotates to audit-YYYYMMDD.jsonl.gz when the active file exceeds 50 MiB.
 *   tail/summary read only the active file in v0.2 (rotated archives are
 *   intentionally out of scope).
 */

import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { createGzip } from "node:zlib";
import { pipeline } from "node:stream/promises";
import lockfile from "proper-lockfile";
import { redactUrl } from "./_url.js";

const ROTATE_BYTES = 50 * 1024 * 1024;

export function stateDir(): string {
  return process.env.WSC_STATE_DIR ?? resolve(homedir(), ".local/state/wsc");
}

export function auditPath(): string {
  return resolve(stateDir(), "audit.jsonl");
}

export function utcIso(ts?: number): string {
  return new Date(ts ?? Date.now()).toISOString();
}

export function queryFingerprint(query: string): { query_hash: string; query_preview: string } {
  if (!query) return { query_hash: "", query_preview: "" };
  const h = createHash("sha256").update(query, "utf8").digest("hex");
  return { query_hash: h, query_preview: query.slice(0, 80) };
}

// --- Receipt schema -------------------------------------------------------

export interface Receipt {
  ts?: string;
  call_id: string;
  parent_call_id?: string | null;
  correlation_id?: string | null;
  op: string;
  provider?: string | null;
  fallback_chain?: Array<{ from: string; to?: string; reason: string; error?: string }>;
  route_decision?: unknown;
  query_hash?: string;
  query_preview?: string;
  params?: Record<string, unknown>;
  results_count?: number;
  selected_count?: number;
  selected_urls?: string[];
  rejected?: Array<{ url: string; reason: string }>;
  artifact_sha256?: string;
  provider_response_schema_version?: string;
  cost_units?: number;
  cost_usd_estimated?: number;
  duration_ms?: number;
  cache_hit?: boolean;
  multi_source_evidence?: Array<{ provider: string; score?: number }>;
  status?: "ok" | "degraded" | "error";
  error?: string;
  started_at?: string;
  // Allow callers to add op-specific fields without losing type-safety on the known ones.
  [k: string]: unknown;
}

// --- Redaction walker ----------------------------------------------------

function walkRedact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walkRedact);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === "url" || k === "source_url" || k === "next_url") {
        out[k] = typeof v === "string" ? redactUrl(v) : v;
      } else if (k === "urls" || k === "selected_urls") {
        out[k] = Array.isArray(v) ? v.map((u) => (typeof u === "string" ? redactUrl(u) : u)) : v;
      } else {
        out[k] = walkRedact(v);
      }
    }
    return out;
  }
  return value;
}

// --- Rotation ------------------------------------------------------------

async function maybeRotate(path: string): Promise<void> {
  if (!existsSync(path)) return;
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return;
  }
  if (size < ROTATE_BYTES) return;
  const yyyymmdd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rotated = resolve(dirname(path), `audit-${yyyymmdd}.jsonl.gz`);
  const src = createReadStream(path);
  const gzip = createGzip();
  const dst = createWriteStream(rotated, { flags: "a" });
  await pipeline(src, gzip, dst);
  unlinkSync(path);
}

// --- Append ----------------------------------------------------------------

function ensureDir(path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function record(event: Partial<Receipt>): Promise<void> {
  const path = auditPath();
  ensureDir(path);
  await maybeRotate(path);

  const payload: Receipt = {
    ts: utcIso(),
    call_id: event.call_id ?? randomUUID(),
    op: event.op ?? "unknown",
    ...event,
  };
  const redacted = walkRedact(payload);
  const line = JSON.stringify(redacted, sortKeysReplacer) + "\n";

  // Lock the parent dir; proper-lockfile creates a sibling .lock dir which
  // works across macOS/Linux without fcntl quirks.
  if (!existsSync(path)) {
    // proper-lockfile needs the file to exist before locking it.
    await appendFile(path, "");
  }
  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(path, { retries: { retries: 10, minTimeout: 5, maxTimeout: 50 } });
    await appendFile(path, line, { encoding: "utf8" });
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        /* ignore lock release errors */
      }
    }
  }
}

// JSON.stringify replacer that produces deterministic key order.
function sortKeysReplacer(_key: string, value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as Record<string, unknown>)[k];
    }
    return sorted;
  }
  return value;
}

// --- withCall (replacement for Python's `start_call` context manager) -----

export interface WithCallOpts {
  provider?: string | null;
  parentCallId?: string | null;
  correlationId?: string | null;
  noReceipt?: boolean;
}

/**
 * Runs `fn` with a Receipt that the caller mutates in-place. On return the
 * receipt is recorded with `duration_ms` filled in. On throw the receipt is
 * recorded with status="error" and the exception re-raised.
 */
export async function withCall<T>(
  op: string,
  opts: WithCallOpts,
  fn: (receipt: Receipt) => Promise<T>,
): Promise<T> {
  const callId = randomUUID();
  const started = Date.now();
  const receipt: Receipt = {
    call_id: callId,
    parent_call_id: opts.parentCallId ?? null,
    correlation_id: opts.correlationId ?? process.env.WSC_CORRELATION_ID ?? null,
    op,
    provider: opts.provider ?? null,
    started_at: utcIso(started),
    status: "ok",
  };
  try {
    return await fn(receipt);
  } catch (err) {
    receipt.status = "error";
    if (!receipt.error) {
      receipt.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    throw err;
  } finally {
    receipt.duration_ms = Date.now() - started;
    receipt.ts = utcIso();
    if (!opts.noReceipt) {
      try {
        await record(receipt);
      } catch {
        // Never let an audit-write failure mask the real error.
      }
    }
  }
}

// --- Tail / summary --------------------------------------------------------

const SINCE_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export function parseSince(spec: string): string {
  const trimmed = spec.trim().toLowerCase();
  if (!trimmed) throw new Error("empty --since");
  const unit = trimmed.slice(-1);
  if (!(unit in SINCE_UNITS)) throw new Error(`unknown --since unit in ${JSON.stringify(spec)} — use s/m/h/d`);
  const n = Number.parseFloat(trimmed.slice(0, -1));
  if (Number.isNaN(n)) throw new Error(`invalid --since value in ${JSON.stringify(spec)}`);
  const cutoff = new Date(Date.now() - Math.floor(n * SINCE_UNITS[unit]!) * 1000);
  return cutoff.toISOString().slice(0, 19);
}

export interface TailOptions {
  lines?: number;
  op?: string;
  provider?: string;
  since?: string;
}

export interface TailPayload {
  ok: boolean;
  operation: "receipts.tail";
  events: Receipt[];
  path: string;
  returncode: number;
}

export async function tail(opts: TailOptions = {}): Promise<TailPayload> {
  const path = auditPath();
  if (!existsSync(path)) {
    return { ok: true, operation: "receipts.tail", events: [], path, returncode: 0 };
  }
  const cutoff = opts.since ? parseSince(opts.since) : null;
  const limit = Math.max(1, Math.min(opts.lines ?? 20, 10000));
  const text = await readFile(path, "utf8");
  const events: Receipt[] = [];
  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let event: Receipt;
    try {
      event = JSON.parse(trimmed) as Receipt;
    } catch {
      continue;
    }
    if (opts.op && !String(event.op ?? "").startsWith(opts.op)) continue;
    if (opts.provider && event.provider !== opts.provider) continue;
    if (cutoff && String(event.ts ?? "") < cutoff) continue;
    events.push(event);
  }
  return {
    ok: true,
    operation: "receipts.tail",
    events: events.slice(-limit),
    path,
    returncode: 0,
  };
}

export interface SummaryOptions {
  days?: number;
  byDomain?: boolean;
  cost?: boolean;
  highConfidence?: boolean;
}

export interface SummaryPayload {
  ok: boolean;
  operation: "receipts.summary";
  path: string;
  returncode: number;
  scope: string;
  event_count: number;
  by_op: Record<string, number>;
  by_provider: Record<string, number>;
  by_status: Record<string, number>;
  cost_units_total?: number;
  cost_usd_estimated_total?: number;
  by_domain?: Record<string, number>;
  high_confidence_events?: Array<{ call_id: string; providers: string[]; ts: string }>;
}

export async function summary(opts: SummaryOptions = {}): Promise<SummaryPayload> {
  const path = auditPath();
  const days = opts.days ?? 0;
  const out: SummaryPayload = {
    ok: true,
    operation: "receipts.summary",
    path,
    returncode: 0,
    scope: days <= 0 ? "all" : `last ${days}d`,
    event_count: 0,
    by_op: {},
    by_provider: {},
    by_status: {},
  };
  if (!existsSync(path)) return out;

  const cutoff = days > 0 ? new Date(Date.now() - days * 86400 * 1000).toISOString().slice(0, 19) : null;
  const text = await readFile(path, "utf8");
  let costUnits = 0;
  let costUsd = 0;
  const byDomain = new Map<string, number>();
  const multiSource: Array<{ call_id: string; providers: string[]; ts: string }> = [];

  for (const raw of text.split("\n")) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    let ev: Receipt;
    try {
      ev = JSON.parse(trimmed) as Receipt;
    } catch {
      continue;
    }
    if (cutoff && String(ev.ts ?? "") < cutoff) continue;
    out.event_count += 1;
    const opKey = ev.op ?? "?";
    out.by_op[opKey] = (out.by_op[opKey] ?? 0) + 1;
    const providerKey = ev.provider ?? "?";
    out.by_provider[providerKey] = (out.by_provider[providerKey] ?? 0) + 1;
    const statusKey = ev.status ?? "?";
    out.by_status[statusKey] = (out.by_status[statusKey] ?? 0) + 1;
    costUnits += Number(ev.cost_units ?? 0);
    costUsd += Number(ev.cost_usd_estimated ?? 0);
    if (opts.byDomain) {
      for (const u of ev.selected_urls ?? []) {
        if (typeof u !== "string" || !u.includes("://")) continue;
        try {
          const host = new URL(u).hostname;
          byDomain.set(host, (byDomain.get(host) ?? 0) + 1);
        } catch {
          /* skip malformed */
        }
      }
    }
    if (opts.highConfidence) {
      const evidence = ev.multi_source_evidence;
      if (Array.isArray(evidence) && evidence.length >= 2) {
        multiSource.push({
          call_id: ev.call_id,
          providers: evidence.map((e) => e.provider),
          ts: String(ev.ts ?? ""),
        });
      }
    }
  }

  if (opts.cost) {
    out.cost_units_total = round4(costUnits);
    out.cost_usd_estimated_total = round4(costUsd);
  }
  if (opts.byDomain) {
    const sorted = Array.from(byDomain.entries()).sort(([, a], [, b]) => b - a).slice(0, 50);
    out.by_domain = Object.fromEntries(sorted);
  }
  if (opts.highConfidence) {
    out.high_confidence_events = multiSource;
  }
  return out;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
