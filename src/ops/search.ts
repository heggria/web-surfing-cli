/** wsc search — Tavily primary, Brave/DDG fallback. */

import { withCall } from "../audit.js";
import { chainFailedPayload, filteredChain, queryFingerprint, runChain } from "./_chain.js";
import type { Action } from "./_chain.js";
import { BraveProvider, DuckDuckGoProvider, NormalizedResult, TavilyProvider } from "../providers/index.js";

const TIME_TO_TAVILY_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
const TIME_TO_BRAVE_FRESHNESS: Record<string, "pd" | "pw" | "pm" | "py"> = { day: "pd", week: "pw", month: "pm", year: "py" };

export interface SearchOptions {
  maxResults?: number;
  timeRange?: "day" | "week" | "month" | "year";
  country?: string;
  correlationId?: string;
  noReceipt?: boolean;
}

export async function run(query: string, opts: SearchOptions = {}): Promise<Record<string, unknown>> {
  const chain = filteredChain("web_facts");
  const max = opts.maxResults ?? 10;

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
      const { active, result, fallback } = await runChain(chain, {
        tavily: tavilyAction,
        brave: braveAction,
        duckduckgo: ddgAction,
      });
      receipt.fallback_chain = fallback;
      if (active === null || result === null) {
        receipt.status = "error";
        return await chainFailedPayload("search", fallback);
      }
      receipt.provider = active;
      const urls = result.map((r) => r.url);
      receipt.selected_urls = urls;
      receipt.results_count = result.length;
      receipt.selected_count = result.length;
      if (active !== chain[0]) receipt.status = "degraded";
      return {
        ok: true,
        operation: "search",
        provider: active,
        query,
        results: result.map((r) => r.toJSON()),
        fallback_chain: fallback,
        status: active !== chain[0] ? "degraded" : "ok",
        returncode: 0,
      };
    },
  );
}
