/** wsc fetch — Firecrawl primary, native fetch+regex stdlib fallback (degraded). Supports batch via runMany. */

import { createHash, randomUUID } from "node:crypto";
import { record, utcIso, withCall } from "../audit.js";
import * as cache from "../cache.js";
import { filteredChain, queryFingerprint, runChain } from "./_chain.js";
import type { Action, FallbackStep } from "./_chain.js";
import { FetchedPage, FirecrawlProvider, TavilyExtractProvider, httpRequest } from "../providers/index.js";
import { normalizeUrl } from "../_url.js";

export interface FetchOptions {
  formats?: string[];
  screenshot?: boolean;
  correlationId?: string;
  noReceipt?: boolean;
  noCache?: boolean;
  /** Optional parent call_id; set by batch_fetch when this is a child. */
  parentCallId?: string;
}

interface FetchCacheValue {
  provider: string;
  page: ReturnType<FetchedPage["toJSON"]>;
  fallback_chain: FallbackStep[];
  cached_status: "ok" | "degraded";
}

const TAG_RE = /<[^>]+>/g;
const WS_RE = /\n{3,}/g;

const ENTITY_MAP: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)));
}

async function stdlibFetch(url: string): Promise<FetchedPage> {
  const resp = await httpRequest(url, { method: "GET", timeoutMs: 30_000 });
  const text = resp.text;
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]!.trim()) : url;
  const body = decodeEntities(text.replace(TAG_RE, "\n")).trim().replace(WS_RE, "\n\n");
  return new FetchedPage({
    url,
    title,
    markdown: body.slice(0, 50_000),
    provider: "urllib",
    status: "degraded",
  });
}

export async function run(url: string, opts: FetchOptions = {}): Promise<Record<string, unknown>> {
  const chain = filteredChain("url_fetch");
  const cKey = cache.cacheKey({
    op: "fetch",
    query: url,
    params: { formats: opts.formats ?? null, screenshot: !!opts.screenshot },
  });
  const firecrawlAction: Action<FetchedPage> = (provider) =>
    (provider as FirecrawlProvider).scrape(url, { formats: opts.formats, screenshot: opts.screenshot });

  const tavilyExtractAction: Action<FetchedPage> = (provider) =>
    (provider as TavilyExtractProvider).extract(url);

  return await withCall(
    "fetch",
    {
      provider: "firecrawl",
      correlationId: opts.correlationId,
      noReceipt: opts.noReceipt,
      parentCallId: opts.parentCallId ?? null,
    },
    async (receipt) => {
      Object.assign(receipt, queryFingerprint(url));
      receipt.params = { formats: opts.formats ?? null, screenshot: !!opts.screenshot };

      const cached = await cache.get<FetchCacheValue>(cKey, cache.CACHE_TTL_SEC.fetch!, { noCache: opts.noCache });
      if (cached) {
        receipt.cache_hit = true;
        receipt.provider = cached.provider;
        receipt.fallback_chain = cached.fallback_chain;
        const cachedUrl = (cached.page as Record<string, unknown>).url;
        receipt.selected_urls = typeof cachedUrl === "string" ? [cachedUrl] : [];
        receipt.selected_count = receipt.selected_urls.length;
        receipt.results_count = receipt.selected_urls.length;
        if (cached.cached_status === "degraded") receipt.status = "degraded";
        return {
          ok: true,
          operation: "fetch",
          provider: cached.provider,
          page: cached.page,
          fallback_chain: cached.fallback_chain,
          status: cached.cached_status,
          cache_hit: true,
          returncode: 0,
        };
      }

      const { active, result, fallback } = await runChain(chain, {
        firecrawl: firecrawlAction,
        "tavily-extract": tavilyExtractAction,
      });
      receipt.fallback_chain = [...fallback];
      receipt.cache_hit = false;

      if (active === null || result === null) {
        try {
          const page = await stdlibFetch(url);
          (receipt.fallback_chain as FallbackStep[]).push({
            from: "firecrawl",
            to: "urllib",
            reason: "all_providers_failed",
          });
          receipt.provider = "urllib";
          receipt.status = "degraded";
          receipt.selected_urls = [page.url];
          receipt.selected_count = 1;
          receipt.results_count = 1;
          const pageJson = page.toJSON();
          await cache.set<FetchCacheValue>(
            cKey,
            { provider: "urllib", page: pageJson, fallback_chain: receipt.fallback_chain as FallbackStep[], cached_status: "degraded" },
            { ttlSec: cache.CACHE_TTL_SEC.fetch!, op: "fetch", provider: "urllib", noCache: opts.noCache },
          );
          return {
            ok: true,
            operation: "fetch",
            provider: "urllib",
            page: pageJson,
            fallback_chain: receipt.fallback_chain,
            status: "degraded",
            cache_hit: false,
            returncode: 0,
          };
        } catch (err) {
          receipt.status = "error";
          receipt.error = (err instanceof Error ? err.message : String(err)).slice(0, 200);
          (receipt.fallback_chain as FallbackStep[]).push({
            from: "urllib",
            reason: "transport_error",
            error: (err instanceof Error ? err.message : String(err)).slice(0, 200),
          });
          return {
            ok: false,
            operation: "fetch",
            provider: null,
            fallback_chain: receipt.fallback_chain,
            error: `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
            returncode: 2,
          };
        }
      }

      receipt.provider = active;
      receipt.selected_urls = result.url ? [result.url] : [];
      receipt.selected_count = 1;
      receipt.results_count = 1;
      const pageJson = result.toJSON();
      const status = result.status;
      await cache.set<FetchCacheValue>(
        cKey,
        { provider: active, page: pageJson, fallback_chain: fallback, cached_status: status === "degraded" ? "degraded" : "ok" },
        { ttlSec: cache.CACHE_TTL_SEC.fetch!, op: "fetch", provider: active, noCache: opts.noCache },
      );
      return {
        ok: true,
        operation: "fetch",
        provider: active,
        page: pageJson,
        fallback_chain: receipt.fallback_chain,
        status: result.status,
        cache_hit: false,
        returncode: 0,
      };
    },
  );
}

export function normalizeForReceipt(url: string): string {
  return normalizeUrl(url);
}

// --- Batch fetch (M2 of v0.3) ---------------------------------------------

export interface BatchFetchOptions extends FetchOptions {
  /** Concurrent in-flight fetches; default 4. */
  concurrency?: number;
  /** Optional override for the parent_call_id of each child receipt. */
  parentCallId?: string;
  /** Op name written to the parent receipt; default "batch_fetch". */
  op?: string;
}

export interface BatchUrlEntry {
  url: string;
  sha256: string | null;
  status: "ok" | "degraded" | "error";
  provider: string | null;
  duration_ms: number;
  title?: string;
  bytes?: number;
  error?: string;
}

/**
 * Fetch multiple URLs concurrently. Each child URL writes its own per-URL fetch
 * receipt (with parent_call_id pointing to this batch); a separate
 * op:"batch_fetch" receipt records the aggregate.
 */
export async function runMany(urls: string[], opts: BatchFetchOptions = {}): Promise<Record<string, unknown>> {
  const opName = opts.op ?? "batch_fetch";
  if (urls.length === 0) {
    return {
      ok: false,
      operation: opName,
      error: "no URLs provided",
      returncode: 2,
    };
  }
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 16));
  const parentCallId = opts.parentCallId ?? randomUUID();
  const started = Date.now();

  const entries: BatchUrlEntry[] = new Array(urls.length);
  let okCount = 0;
  let degradedCount = 0;
  let errorCount = 0;

  // Simple bounded-parallel queue: process [start..end) slots indexed by `i`.
  let next = 0;
  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= urls.length) return;
      const url = urls[i]!;
      const childStart = Date.now();
      try {
        const childResult = await run(url, {
          formats: opts.formats,
          screenshot: opts.screenshot,
          correlationId: opts.correlationId,
          noReceipt: opts.noReceipt,
          noCache: opts.noCache,
          parentCallId,
        } as FetchOptions);
        const ok = childResult.ok === true;
        const page = childResult.page as Record<string, unknown> | undefined;
        const md = (page?.markdown as string | undefined) ?? "";
        const sha = md ? createHash("sha256").update(md, "utf8").digest("hex") : null;
        const status = (childResult.status as "ok" | "degraded" | "error" | undefined) ?? (ok ? "ok" : "error");
        if (status === "ok") okCount += 1;
        else if (status === "degraded") degradedCount += 1;
        else errorCount += 1;
        entries[i] = {
          url,
          sha256: sha,
          status,
          provider: (childResult.provider as string) ?? null,
          duration_ms: Date.now() - childStart,
          title: (page?.title as string) ?? undefined,
          bytes: md ? md.length : undefined,
          error: ok ? undefined : ((childResult.error as string | undefined) ?? undefined),
        };
      } catch (err) {
        errorCount += 1;
        entries[i] = {
          url,
          sha256: null,
          status: "error",
          provider: null,
          duration_ms: Date.now() - childStart,
          error: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : String(err).slice(0, 200),
        };
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()));

  // Write the parent batch_fetch / verify receipt.
  const overallStatus: "ok" | "degraded" | "error" =
    errorCount === urls.length ? "error" : degradedCount + errorCount > 0 ? "degraded" : "ok";
  const batchReceipt = {
    ts: utcIso(),
    call_id: parentCallId,
    parent_call_id: null,
    correlation_id: opts.correlationId ?? process.env.WSC_CORRELATION_ID ?? null,
    op: opName,
    provider: null,
    selected_urls: urls,
    results_count: urls.length,
    selected_count: urls.length,
    urls: entries.map((e) => ({
      url: e.url,
      sha256: e.sha256 ?? undefined,
      status: e.status,
      provider: e.provider ?? undefined,
      duration_ms: e.duration_ms,
    })),
    duration_ms: Date.now() - started,
    started_at: utcIso(started),
    status: overallStatus,
  };
  if (!opts.noReceipt) {
    try {
      await record(batchReceipt);
    } catch {
      /* never let audit failure mask op result */
    }
  }

  return {
    ok: errorCount < urls.length,
    operation: opName,
    parent_call_id: parentCallId,
    urls: entries,
    counts: { ok: okCount, degraded: degradedCount, error: errorCount, total: urls.length },
    duration_ms: Date.now() - started,
    status: overallStatus,
    returncode: errorCount === urls.length ? 2 : 0,
  };
}
