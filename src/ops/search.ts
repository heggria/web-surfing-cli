/** wsc search — Tavily primary, Brave/DDG fallback. Optional --corroborate for parallel fan-out. */

import { withCall } from "../audit.js";
import * as cache from "../cache.js";
import { chainFailedPayload, filteredChain, queryFingerprint, runChain, runChainParallel } from "./_chain.js";
import type { Action, FallbackStep } from "./_chain.js";
import { BraveProvider, DuckDuckGoProvider, NormalizedResult, TavilyProvider } from "../providers/index.js";

const TIME_TO_TAVILY_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
const TIME_TO_BRAVE_FRESHNESS: Record<string, "pd" | "pw" | "pm" | "py"> = { day: "pd", week: "pw", month: "pm", year: "py" };

export interface SearchOptions {
  maxResults?: number;
  timeRange?: "day" | "week" | "month" | "year";
  country?: string;
  /** Fan out to up to N providers in parallel and cross-validate results. 0/undefined = single-provider chain. */
  corroborate?: number;
  correlationId?: string;
  noReceipt?: boolean;
  noCache?: boolean;
}

interface SearchCacheValue {
  provider: string;
  results: Record<string, unknown>[];
  fallback_chain: FallbackStep[];
  cached_status: "ok" | "degraded";
  multi_source_evidence?: Array<{ provider: string; score?: number }>;
}

export async function run(query: string, opts: SearchOptions = {}): Promise<Record<string, unknown>> {
  const chain = filteredChain("web_facts");
  const max = opts.maxResults ?? 10;
  const corroborate = opts.corroborate && opts.corroborate >= 2 ? opts.corroborate : 0;
  const cKey = cache.cacheKey({
    op: corroborate ? `search:corroborate-${corroborate}` : "search",
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
      receipt.params = {
        max_results: max,
        time_range: opts.timeRange ?? null,
        country: opts.country ?? null,
        corroborate: corroborate || null,
      };

      const cached = await cache.get<SearchCacheValue>(cKey, cache.CACHE_TTL_SEC.search!, { noCache: opts.noCache });
      if (cached) {
        receipt.cache_hit = true;
        receipt.provider = cached.provider;
        receipt.fallback_chain = cached.fallback_chain;
        receipt.selected_urls = cached.results.map((r) => String((r as Record<string, unknown>).url ?? ""));
        receipt.results_count = cached.results.length;
        receipt.selected_count = cached.results.length;
        if (cached.multi_source_evidence) receipt.multi_source_evidence = cached.multi_source_evidence;
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
          multi_source_evidence: cached.multi_source_evidence,
          returncode: 0,
        };
      }

      // --- Corroborate (parallel fan-out) path ---
      if (corroborate) {
        const { result, active, participants, failures } = await runChainParallel(
          chain,
          { tavily: tavilyAction, brave: braveAction, duckduckgo: ddgAction },
          { count: corroborate },
        );
        receipt.fallback_chain = failures;
        receipt.cache_hit = false;
        if (active === null) {
          receipt.status = "error";
          return await chainFailedPayload("search", failures);
        }
        receipt.provider = active;
        receipt.selected_urls = result.map((r) => r.url);
        receipt.results_count = result.length;
        receipt.selected_count = result.length;
        const productive = participants.filter((p) => p.result_count > 0);
        const multiEvidence = productive.map((p) => ({
          provider: p.provider,
          ...(p.best_score != null ? { score: p.best_score } : {}),
        }));
        receipt.multi_source_evidence = multiEvidence;
        // ≥2 providers actually contributed results = ok; otherwise the fan-out
        // collapsed into a single-source answer = degraded.
        const status: "ok" | "degraded" = productive.length >= 2 ? "ok" : "degraded";
        if (status === "degraded") receipt.status = "degraded";
        const resultsJson = result.map((r) => r.toJSON());
        await cache.set<SearchCacheValue>(
          cKey,
          {
            provider: active,
            results: resultsJson,
            fallback_chain: failures,
            cached_status: status,
            multi_source_evidence: multiEvidence,
          },
          { ttlSec: cache.CACHE_TTL_SEC.search!, op: "search:corroborate", provider: active, noCache: opts.noCache },
        );
        return {
          ok: true,
          operation: "search",
          provider: active,
          query,
          results: resultsJson,
          fallback_chain: failures,
          status,
          cache_hit: false,
          multi_source_evidence: multiEvidence,
          participants,
          returncode: 0,
        };
      }

      // --- Single-provider path (existing) ---
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
