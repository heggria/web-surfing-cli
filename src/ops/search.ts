/** wsc search — Tavily primary, Brave/DDG fallback. */

import { withCall } from "../audit.js";
import * as cache from "../cache.js";
import { chainFailedPayload, filteredChain, queryFingerprint, runChain } from "./_chain.js";
import type { Action, FallbackStep } from "./_chain.js";
import { BraveProvider, DuckDuckGoProvider, NormalizedResult, TavilyProvider } from "../providers/index.js";

const TIME_TO_TAVILY_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
const TIME_TO_BRAVE_FRESHNESS: Record<string, "pd" | "pw" | "pm" | "py"> = { day: "pd", week: "pw", month: "pm", year: "py" };

export interface SearchOptions {
  maxResults?: number;
  timeRange?: "day" | "week" | "month" | "year";
  country?: string;
  correlationId?: string;
  noReceipt?: boolean;
  noCache?: boolean;
}

interface SearchCacheValue {
  provider: string;
  results: Record<string, unknown>[];
  fallback_chain: FallbackStep[];
  cached_status: "ok" | "degraded";
}

export async function run(query: string, opts: SearchOptions = {}): Promise<Record<string, unknown>> {
  const chain = filteredChain("web_facts");
  const max = opts.maxResults ?? 10;
  const cKey = cache.cacheKey({
    op: "search",
    query,
    params: { max_results: max, time_range: opts.timeRange ?? null, country: opts.country ?? null },
  });

  const tavilyAction: Action<NormalizedResult[]> = (provider) =>
    (provider as TavilyProvider).search(query, {
      maxResults: max,
      searchDepth: "basic",
      topic: opts.timeRange ? "news" : undefined,
      days: opts.timeRange ? TIME_TO_TAVILY_DAYS[opts.timeRange] : undefined,
      country: opts.country,
    });

  const braveAction: Action<NormalizedResult[]> = (provider) =>
    (provider as BraveProvider).search(query, {
      count: max,
      country: opts.country,
      freshness: opts.timeRange ? TIME_TO_BRAVE_FRESHNESS[opts.timeRange] : undefined,
    });

  const ddgAction: Action<NormalizedResult[]> = (provider) =>
    (provider as DuckDuckGoProvider).search(query, { count: max });

  return await withCall(
    "search",
    { provider: chain[0] ?? null, correlationId: opts.correlationId, noReceipt: opts.noReceipt },
    async (receipt) => {
      Object.assign(receipt, queryFingerprint(query));
      receipt.params = { max_results: max, time_range: opts.timeRange ?? null, country: opts.country ?? null };

      const cached = await cache.get<SearchCacheValue>(cKey, cache.CACHE_TTL_SEC.search!, { noCache: opts.noCache });
      if (cached) {
        receipt.cache_hit = true;
        receipt.provider = cached.provider;
        receipt.fallback_chain = cached.fallback_chain;
        receipt.selected_urls = cached.results.map((r) => String((r as Record<string, unknown>).url ?? ""));
        receipt.results_count = cached.results.length;
        receipt.selected_count = cached.results.length;
        if (cached.cached_status === "degraded") receipt.status = "degraded";
        return {
          ok: true,
          operation: "search",
          provider: cached.provider,
          query,
          results: cached.results,
          fallback_chain: cached.fallback_chain,
          status: cached.cached_status,
          cache_hit: true,
          returncode: 0,
        };
      }

      const { active, result, fallback } = await runChain(chain, {
        tavily: tavilyAction,
        brave: braveAction,
        duckduckgo: ddgAction,
      });
      receipt.fallback_chain = fallback;
      receipt.cache_hit = false;
      if (active === null || result === null) {
        receipt.status = "error";
        return await chainFailedPayload("search", fallback);
      }
      receipt.provider = active;
      const urls = result.map((r) => r.url);
      receipt.selected_urls = urls;
      receipt.results_count = result.length;
      receipt.selected_count = result.length;
      const status: "ok" | "degraded" = active !== chain[0] ? "degraded" : "ok";
      if (status === "degraded") receipt.status = "degraded";
      const resultsJson = result.map((r) => r.toJSON());
      await cache.set<SearchCacheValue>(
        cKey,
        { provider: active, results: resultsJson, fallback_chain: fallback, cached_status: status },
        { ttlSec: cache.CACHE_TTL_SEC.search!, op: "search", provider: active, noCache: opts.noCache },
      );
      return {
        ok: true,
        operation: "search",
        provider: active,
        query,
        results: resultsJson,
        fallback_chain: fallback,
        status,
        cache_hit: false,
        returncode: 0,
      };
    },
  );
}
