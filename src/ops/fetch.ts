/** wsc fetch — Firecrawl primary, native fetch+regex stdlib fallback (degraded). */

import { withCall } from "../audit.js";
import * as cache from "../cache.js";
import { filteredChain, queryFingerprint, runChain } from "./_chain.js";
import type { Action, FallbackStep } from "./_chain.js";
import { FetchedPage, FirecrawlProvider, httpRequest } from "../providers/index.js";
import { normalizeUrl } from "../_url.js";

export interface FetchOptions {
  formats?: string[];
  screenshot?: boolean;
  correlationId?: string;
  noReceipt?: boolean;
  noCache?: boolean;
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

  return await withCall(
    "fetch",
    { provider: "firecrawl", correlationId: opts.correlationId, noReceipt: opts.noReceipt },
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

      const { active, result, fallback } = await runChain(chain, { firecrawl: firecrawlAction });
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
