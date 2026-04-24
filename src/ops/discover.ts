/** wsc discover — Exa primary, Tavily/Brave/DDG fallbacks. */

import { withCall } from "../audit.js";
import * as cache from "../cache.js";
import { chainFailedPayload, filteredChain, queryFingerprint, runChain } from "./_chain.js";
import type { Action, FallbackStep } from "./_chain.js";
import {
  BraveProvider,
  DuckDuckGoProvider,
  ExaProvider,
  NormalizedResult,
  TavilyProvider,
} from "../providers/index.js";

const TYPE_TO_EXA_CATEGORY: Record<string, string> = {
  code: "github",
  paper: "research paper",
  company: "company",
  people: "person",
};

export interface DiscoverOptions {
  type?: "code" | "paper" | "company" | "people";
  sinceDays?: number;
  numResults?: number;
  correlationId?: string;
  noReceipt?: boolean;
  noCache?: boolean;
}

interface DiscoverCacheValue {
  provider: string;
  results: Record<string, unknown>[];
  fallback_chain: FallbackStep[];
  cached_status: "ok" | "degraded";
}

export async function run(query: string, opts: DiscoverOptions = {}): Promise<Record<string, unknown>> {
  const chain = filteredChain("semantic_discovery");
  const category = opts.type ? TYPE_TO_EXA_CATEGORY[opts.type] : undefined;
  const framed = reframeForKeywordSearch(query, opts.type);
  const num = opts.numResults ?? 10;
  const cKey = cache.cacheKey({
    op: "discover",
    query,
    params: { type: opts.type ?? null, sinceDays: opts.sinceDays ?? null, numResults: num },
  });

  const exaAction: Action<NormalizedResult[]> = (provider) =>
    (provider as ExaProvider).search(query, {
      numResults: num,
      type: "auto",
      category,
      startPublishedDate: opts.sinceDays ? daysAgoIso(opts.sinceDays) : undefined,
    });

  const tavilyAction: Action<NormalizedResult[]> = (provider) =>
    (provider as TavilyProvider).search(framed, { maxResults: num, searchDepth: "advanced" });

  const braveAction: Action<NormalizedResult[]> = (provider) =>
    (provider as BraveProvider).search(framed, { count: num });

  const ddgAction: Action<NormalizedResult[]> = (provider) =>
    (provider as DuckDuckGoProvider).search(framed, { count: num });

  return await withCall(
    "discover",
    { provider: chain[0] ?? null, correlationId: opts.correlationId, noReceipt: opts.noReceipt },
    async (receipt) => {
      Object.assign(receipt, queryFingerprint(query));
      receipt.params = { type: opts.type ?? null, sinceDays: opts.sinceDays ?? null, numResults: num };

      const cached = await cache.get<DiscoverCacheValue>(cKey, cache.CACHE_TTL_SEC.discover!, { noCache: opts.noCache });
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
          operation: "discover",
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
        exa: exaAction,
        tavily: tavilyAction,
        brave: braveAction,
        duckduckgo: ddgAction,
      });
      receipt.fallback_chain = fallback;
      receipt.cache_hit = false;
      if (active === null || result === null) {
        receipt.status = "error";
        return await chainFailedPayload("discover", fallback);
      }
      receipt.provider = active;
      const urls = result.map((r) => r.url);
      receipt.selected_urls = urls;
      receipt.results_count = result.length;
      receipt.selected_count = result.length;
      const status: "ok" | "degraded" = active !== chain[0] ? "degraded" : "ok";
      if (status === "degraded") receipt.status = "degraded";
      const resultsJson = result.map((r) => r.toJSON());
      await cache.set<DiscoverCacheValue>(
        cKey,
        { provider: active, results: resultsJson, fallback_chain: fallback, cached_status: status },
        { ttlSec: cache.CACHE_TTL_SEC.discover!, op: "discover", provider: active, noCache: opts.noCache },
      );
      return {
        ok: true,
        operation: "discover",
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

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
}

function reframeForKeywordSearch(query: string, type?: string): string {
  if (!type) return query;
  if (type === "paper") return `research papers about: ${query}`;
  if (type === "code") return `github examples of: ${query}`;
  if (type === "company") return `company information about: ${query}`;
  if (type === "people") return `people associated with: ${query}`;
  return query;
}
