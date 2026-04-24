/**
 * Content-addressed cache for op responses (M0 of v0.3).
 *
 * - Key = sha256(canonicalize({op, query, params}))
 * - Path = $WSC_CACHE_DIR/blobs/<aa>/<bb>/<sha>.json
 *   (default ~/.cache/wsc/blobs/...)
 * - Per-op TTL (`CACHE_TTL_SEC`); expired entries are treated as misses
 *   (no proactive purge on read).
 * - Disabled by `--no-cache` CLI flag or `WSC_NO_CACHE=1` env.
 *
 * The cache is *advisory*: a corrupt blob or unexpected schema returns null
 * instead of throwing — never let a cache mishap mask a real op error.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { cacheDir as configCacheDir } from "./config.js";

// --- TTLs -----------------------------------------------------------------

export const CACHE_TTL_SEC: Record<string, number> = {
  search: 5 * 60,
  discover: 30 * 60,
  fetch: 60 * 60,
  docs: 60 * 60,
};

// --- Paths ----------------------------------------------------------------

export function blobsDir(): string {
  return resolve(configCacheDir(), "blobs");
}

function blobPath(key: string): string {
  return resolve(blobsDir(), key.slice(0, 2), key.slice(2, 4), `${key}.json`);
}

// --- Key fingerprinting ---------------------------------------------------

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeys((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function cacheKey(parts: { op: string; query: string; params: Record<string, unknown> }): string {
  const canonical = JSON.stringify({
    op: parts.op,
    query: parts.query,
    params: sortKeys(parts.params),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

// --- Enable / disable -----------------------------------------------------

function cacheEnabled(noCache?: boolean): boolean {
  if (noCache) return false;
  if (process.env.WSC_NO_CACHE === "1") return false;
  return true;
}

// --- Envelope -------------------------------------------------------------

interface CacheEnvelope<V> {
  cached_at: string;
  expires_at: string;
  ttl_sec: number;
  key: string;
  op: string;
  provider: string;
  value: V;
}

// --- Read / write ---------------------------------------------------------

export async function get<V>(
  key: string,
  ttlSec: number,
  opts: { noCache?: boolean } = {},
): Promise<V | null> {
  if (!cacheEnabled(opts.noCache)) return null;
  if (ttlSec <= 0) return null;
  const path = blobPath(key);
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  }
  let env: CacheEnvelope<V>;
  try {
    env = JSON.parse(raw) as CacheEnvelope<V>;
  } catch {
    return null;
  }
  if (env.expires_at && new Date(env.expires_at).getTime() < Date.now()) return null;
  return env.value ?? null;
}

export async function set<V>(
  key: string,
  value: V,
  meta: { ttlSec: number; op: string; provider: string; noCache?: boolean },
): Promise<void> {
  if (!cacheEnabled(meta.noCache)) return;
  if (meta.ttlSec <= 0) return;
  const path = blobPath(key);
  const dir = resolve(path, "..");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const cachedAt = new Date();
  const expiresAt = new Date(cachedAt.getTime() + meta.ttlSec * 1000);
  const env: CacheEnvelope<V> = {
    cached_at: cachedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    ttl_sec: meta.ttlSec,
    key,
    op: meta.op,
    provider: meta.provider,
    value,
  };
  try {
    writeFileSync(path, JSON.stringify(env), "utf8");
  } catch {
    // Cache write failures must never propagate.
  }
}

// --- Walk / stats / clear -------------------------------------------------

interface BlobEntry {
  path: string;
  size: number;
  env: CacheEnvelope<unknown> | null;
}

function* walkBlobs(): Generator<BlobEntry> {
  const root = blobsDir();
  if (!existsSync(root)) return;
  let firstLevel: string[];
  try {
    firstLevel = readdirSync(root);
  } catch {
    return;
  }
  for (const a of firstLevel) {
    const aPath = resolve(root, a);
    let aStat;
    try {
      aStat = statSync(aPath);
    } catch {
      continue;
    }
    if (!aStat.isDirectory()) continue;
    let secondLevel: string[];
    try {
      secondLevel = readdirSync(aPath);
    } catch {
      continue;
    }
    for (const b of secondLevel) {
      const bPath = resolve(aPath, b);
      let bStat;
      try {
        bStat = statSync(bPath);
      } catch {
        continue;
      }
      if (!bStat.isDirectory()) continue;
      let files: string[];
      try {
        files = readdirSync(bPath);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        const filePath = resolve(bPath, f);
        let fStat;
        try {
          fStat = statSync(filePath);
        } catch {
          continue;
        }
        let env: CacheEnvelope<unknown> | null = null;
        try {
          env = JSON.parse(readFileSync(filePath, "utf8")) as CacheEnvelope<unknown>;
        } catch {
          /* leave env null; entry is still counted */
        }
        yield { path: filePath, size: fStat.size, env };
      }
    }
  }
}

export interface CacheStats {
  ok: true;
  operation: "cache.stats";
  path: string;
  count: number;
  size_bytes: number;
  size_human: string;
  by_op: Record<string, number>;
  by_provider: Record<string, number>;
  oldest: string | null;
  newest: string | null;
  expired_count: number;
  returncode: 0;
}

export function stats(): CacheStats {
  let count = 0;
  let sizeBytes = 0;
  const byOp: Record<string, number> = {};
  const byProvider: Record<string, number> = {};
  let oldest: string | null = null;
  let newest: string | null = null;
  let expiredCount = 0;
  const now = Date.now();
  for (const { size, env } of walkBlobs()) {
    count += 1;
    sizeBytes += size;
    if (env) {
      const op = env.op ?? "?";
      const provider = env.provider ?? "?";
      byOp[op] = (byOp[op] ?? 0) + 1;
      byProvider[provider] = (byProvider[provider] ?? 0) + 1;
      if (env.cached_at) {
        if (oldest === null || env.cached_at < oldest) oldest = env.cached_at;
        if (newest === null || env.cached_at > newest) newest = env.cached_at;
      }
      if (env.expires_at && new Date(env.expires_at).getTime() < now) expiredCount += 1;
    }
  }
  return {
    ok: true,
    operation: "cache.stats",
    path: blobsDir(),
    count,
    size_bytes: sizeBytes,
    size_human: humanSize(sizeBytes),
    by_op: byOp,
    by_provider: byProvider,
    oldest,
    newest,
    expired_count: expiredCount,
    returncode: 0,
  };
}

export interface CacheClearOptions {
  olderThanSec?: number;
  expiredOnly?: boolean;
  op?: string;
  provider?: string;
  all?: boolean;
}

export interface CacheClearResult {
  ok: boolean;
  operation: "cache.clear";
  path: string;
  removed_count: number;
  removed_bytes: number;
  size_human: string;
  returncode: number;
  error?: string;
}

export function clear(opts: CacheClearOptions = {}): CacheClearResult {
  // Safety: refuse to clear everything unless --all or some constraint is set.
  const hasConstraint = opts.olderThanSec != null || opts.expiredOnly === true || opts.op || opts.provider;
  if (!opts.all && !hasConstraint) {
    return {
      ok: false,
      operation: "cache.clear",
      path: blobsDir(),
      removed_count: 0,
      removed_bytes: 0,
      size_human: "0 B",
      returncode: 2,
      error:
        "wsc cache clear: refusing to clear everything without --all (or specify --older-than / --expired-only / --op / --provider)",
    };
  }
  const now = Date.now();
  const cutoff = opts.olderThanSec != null ? now - opts.olderThanSec * 1000 : null;
  let removedCount = 0;
  let removedBytes = 0;
  for (const entry of walkBlobs()) {
    const { path, size, env } = entry;
    if (opts.op && env?.op !== opts.op) continue;
    if (opts.provider && env?.provider !== opts.provider) continue;
    let removeThis = false;
    if (opts.all) {
      removeThis = true;
    } else if (opts.expiredOnly && env?.expires_at && new Date(env.expires_at).getTime() < now) {
      removeThis = true;
    } else if (cutoff !== null && env?.cached_at && new Date(env.cached_at).getTime() < cutoff) {
      removeThis = true;
    } else if ((opts.op || opts.provider) && !opts.expiredOnly && cutoff === null) {
      // Pure --op/--provider filter without time/expiry constraint = remove all matching.
      removeThis = true;
    }
    if (removeThis) {
      try {
        unlinkSync(path);
        removedCount += 1;
        removedBytes += size;
      } catch {
        /* ignore individual unlink failure */
      }
    }
  }
  return {
    ok: true,
    operation: "cache.clear",
    path: blobsDir(),
    removed_count: removedCount,
    removed_bytes: removedBytes,
    size_human: humanSize(removedBytes),
    returncode: 0,
  };
}

// --- Helpers --------------------------------------------------------------

const DUR_UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };

export function parseDurationSec(spec: string): number {
  const trimmed = spec.trim().toLowerCase();
  if (!trimmed) throw new Error("empty duration");
  const unit = trimmed.slice(-1);
  if (!(unit in DUR_UNITS)) throw new Error(`unknown duration unit: ${spec} (use s/m/h/d)`);
  const n = Number.parseFloat(trimmed.slice(0, -1));
  if (Number.isNaN(n)) throw new Error(`invalid duration: ${spec}`);
  return Math.floor(n * DUR_UNITS[unit]!);
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
