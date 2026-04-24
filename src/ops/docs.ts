/** wsc docs — Context7 primary, Firecrawl GitHub README fallback. */

import { withCall } from "../audit.js";
import * as cache from "../cache.js";
import { chainFailedPayload, filteredChain, queryFingerprint, runChain } from "./_chain.js";
import type { Action, FallbackStep } from "./_chain.js";
import { Context7Provider, FetchedPage, FirecrawlProvider, ProviderError } from "../providers/index.js";

export interface DocsOptions {
  topic?: string;
  version?: string;
  correlationId?: string;
  noReceipt?: boolean;
  noCache?: boolean;
}

export interface DocsPayload {
  ok: boolean;
  operation: "docs";
  provider: string | null;
  library: string;
  library_id?: string;
  topic?: string | null;
  page?: ReturnType<FetchedPage["toJSON"]>;
  fallback_chain: FallbackStep[];
  status?: string;
  cache_hit?: boolean;
  returncode: number;
  error?: string;
}

interface DocsCacheValue {
  provider: string;
  library_id: string;
  page: ReturnType<FetchedPage["toJSON"]>;
  fallback_chain: FallbackStep[];
  cached_status: "ok" | "degraded";
}

export async function run(library: string, opts: DocsOptions = {}): Promise<DocsPayload> {
  const chain = filteredChain("library_docs");
  const cKey = cache.cacheKey({
    op: "docs",
    query: library,
    params: { topic: opts.topic ?? null, version: opts.version ?? null },
  });

  const context7Action: Action<{ library_id: string; page: FetchedPage }> = async (provider) => {
    const ctx = provider as Context7Provider;
    const candidates = await ctx.resolveLibrary(library);
    if (candidates.length === 0) throw new ProviderError(`context7: no library found for ${JSON.stringify(library)}`);
    const top = candidates[0]!;
    const libraryId = (top.url.split("/api/v1", 2)[1] ?? "/" + library) || "/" + library;
    const page = await ctx.getDocs(libraryId, { topic: opts.topic });
    return { library_id: libraryId, page };
  };

  const firecrawlAction: Action<{ library_id: string; page: FetchedPage }> = async (provider) => {
    const fc = provider as FirecrawlProvider;
    const guesses = [
      `https://raw.githubusercontent.com/${library}/${library}/main/README.md`,
      `https://github.com/${library}/${library}`,
    ];
    let lastErr: unknown = null;
    for (const url of guesses) {
      try {
        const page = await fc.scrape(url);
        page.status = "degraded";
        return { library_id: library, page };
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr instanceof Error ? lastErr : new ProviderError("firecrawl: no readme found for fallback");
  };

  return await withCall(
    "docs",
    { provider: chain[0] ?? null, correlationId: opts.correlationId, noReceipt: opts.noReceipt },
    async (receipt) => {
      Object.assign(receipt, queryFingerprint(library));
      receipt.params = { topic: opts.topic ?? null, version: opts.version ?? null };

      const cached = await cache.get<DocsCacheValue>(cKey, cache.CACHE_TTL_SEC.docs!, { noCache: opts.noCache });
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
          operation: "docs",
          provider: cached.provider,
          library,
          library_id: cached.library_id,
          topic: opts.topic ?? null,
          page: cached.page,
          fallback_chain: cached.fallback_chain,
          status: cached.cached_status,
          cache_hit: true,
          returncode: 0,
        };
      }

      const { active, result, fallback } = await runChain(chain, {
        context7: context7Action,
        firecrawl: firecrawlAction,
      });
      receipt.fallback_chain = fallback;
      receipt.cache_hit = false;
      if (active === null || result === null) {
        receipt.status = "error";
        const failed = await chainFailedPayload("docs", fallback);
        return {
          ...failed,
          library,
          fallback_chain: fallback,
        } as unknown as DocsPayload;
      }
      receipt.provider = active;
      const page = result.page;
      receipt.selected_urls = page.url ? [page.url] : [];
      receipt.selected_count = page.url ? 1 : 0;
      receipt.results_count = 1;
      if (page.status === "degraded") receipt.status = "degraded";
      const pageJson = page.toJSON();
      const cachedStatus: "ok" | "degraded" = page.status === "degraded" ? "degraded" : "ok";
      await cache.set<DocsCacheValue>(
        cKey,
        { provider: active, library_id: result.library_id, page: pageJson, fallback_chain: fallback, cached_status: cachedStatus },
        { ttlSec: cache.CACHE_TTL_SEC.docs!, op: "docs", provider: active, noCache: opts.noCache },
      );
      return {
        ok: true,
        operation: "docs",
        provider: active,
        library,
        library_id: result.library_id,
        topic: opts.topic ?? null,
        page: pageJson,
        fallback_chain: fallback,
        status: page.status,
        cache_hit: false,
        returncode: 0,
      } as DocsPayload;
    },
  );
}
