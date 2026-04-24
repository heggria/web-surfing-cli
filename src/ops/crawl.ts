/**
 * wsc crawl — Firecrawl-only with apply gates. No fallback (fail loud).
 *
 * Apply ladder:
 *   ≤10 pages   → no --apply required
 *   11–100      → require --apply
 *   >100        → require --apply --i-know-this-burns-credits
 */

import { withCall } from "../audit.js";
import { queryFingerprint } from "./_chain.js";
import { DisabledError, FirecrawlProvider, MissingKeyError, ProviderError, getProvider } from "../providers/index.js";

export interface CrawlOptions {
  maxPages?: number;
  includePaths?: string[];
  excludePaths?: string[];
  formats?: string[];
  apply?: boolean;
  deepApply?: boolean;
  correlationId?: string;
  noReceipt?: boolean;
}

export function gatePages(maxPages: number, opts: { apply: boolean; deepApply: boolean }): string | null {
  if (maxPages <= 10) return null;
  if (maxPages <= 100 && !opts.apply) return `crawl of ${maxPages} pages requires --apply (range 11–100)`;
  if (maxPages > 100 && !(opts.apply && opts.deepApply)) {
    return `crawl of ${maxPages} pages requires --apply --i-know-this-burns-credits`;
  }
  return null;
}

export async function run(url: string, opts: CrawlOptions = {}): Promise<Record<string, unknown>> {
  const maxPages = opts.maxPages ?? 10;
  const block = gatePages(maxPages, { apply: !!opts.apply, deepApply: !!opts.deepApply });
  if (block) {
    return {
      ok: false,
      operation: "crawl",
      error: block,
      url,
      max_pages: maxPages,
      fallback_chain: [],
      returncode: 2,
    };
  }

  return await withCall(
    "crawl",
    { provider: "firecrawl", correlationId: opts.correlationId, noReceipt: opts.noReceipt },
    async (receipt) => {
      Object.assign(receipt, queryFingerprint(url));
      receipt.params = {
        max_pages: maxPages,
        include_paths: opts.includePaths ?? null,
        exclude_paths: opts.excludePaths ?? null,
        formats: opts.formats ?? null,
        apply: !!opts.apply,
      };
      let provider: FirecrawlProvider;
      try {
        provider = getProvider("firecrawl") as FirecrawlProvider;
      } catch (err) {
        if (err instanceof MissingKeyError || err instanceof DisabledError) {
          receipt.status = "error";
          receipt.fallback_chain = [{ from: "firecrawl", reason: err.kind }];
          return {
            ok: false,
            operation: "crawl",
            provider: null,
            fallback_chain: receipt.fallback_chain,
            error: err.message,
            returncode: 2,
          };
        }
        throw err;
      }
      try {
        const pages = await provider.crawl(url, {
          limit: maxPages,
          includePaths: opts.includePaths,
          excludePaths: opts.excludePaths,
          formats: opts.formats,
        });
        receipt.provider = "firecrawl";
        receipt.fallback_chain = [];
        const urls = pages.map((p) => p.url).filter((u) => !!u);
        receipt.selected_urls = urls;
        receipt.selected_count = urls.length;
        receipt.results_count = pages.length;
        return {
          ok: true,
          operation: "crawl",
          provider: "firecrawl",
          url,
          max_pages: maxPages,
          pages: pages.map((p) => p.toJSON()),
          returncode: 0,
        };
      } catch (err) {
        receipt.status = "error";
        receipt.error = (err instanceof Error ? err.message : String(err)).slice(0, 200);
        return {
          ok: false,
          operation: "crawl",
          provider: "firecrawl",
          error: err instanceof ProviderError ? err.message : String(err),
          returncode: 1,
        };
      }
    },
  );
}
