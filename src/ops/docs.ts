/** wsc docs — Context7 primary, Firecrawl GitHub README fallback. */

import { withCall } from "../audit.js";
import { chainFailedPayload, filteredChain, queryFingerprint, runChain } from "./_chain.js";
import type { Action } from "./_chain.js";
import { Context7Provider, FetchedPage, FirecrawlProvider, ProviderError } from "../providers/index.js";

export interface DocsOptions {
  topic?: string;
  version?: string;
  correlationId?: string;
  noReceipt?: boolean;
}

export interface DocsPayload {
  ok: boolean;
  operation: "docs";
  provider: string | null;
  library: string;
  library_id?: string;
  topic?: string | null;
  page?: ReturnType<FetchedPage["toJSON"]>;
  fallback_chain: ReturnType<typeof filteredChain> extends readonly (infer _)[] ? Array<{ from: string; reason: string; error?: string }> : never;
  status?: string;
  returncode: number;
  error?: string;
}

export async function run(library: string, opts: DocsOptions = {}): Promise<DocsPayload> {
  const chain = filteredChain("library_docs");

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
      const { active, result, fallback } = await runChain(chain, {
        context7: context7Action,
        firecrawl: firecrawlAction,
      });
      receipt.fallback_chain = fallback;
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
      return {
        ok: true,
        operation: "docs",
        provider: active,
        library,
        library_id: result.library_id,
        topic: opts.topic ?? null,
        page: page.toJSON(),
        fallback_chain: fallback,
        status: page.status,
        returncode: 0,
      } as DocsPayload;
    },
  );
}
