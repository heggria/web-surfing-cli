/** wsc discover — Exa primary, Tavily/Brave/DDG fallbacks. */

import { withCall } from "../audit.js";
import { chainFailedPayload, filteredChain, queryFingerprint, runChain } from "./_chain.js";
import type { Action } from "./_chain.js";
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
}

export async function run(query: string, opts: DiscoverOptions = {}): Promise<Record<string, unknown>> {
  const chain = filteredChain("semantic_discovery");
  const category = opts.type ? TYPE_TO_EXA_CATEGORY[opts.type] : undefined;
  const framed = reframeForKeywordSearch(query, opts.type);
  const num = opts.numResults ?? 10;

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
      const { active, result, fallback } = await runChain(chain, {
        exa: exaAction,
        tavily: tavilyAction,
        brave: braveAction,
        duckduckgo: ddgAction,
      });
      receipt.fallback_chain = fallback;
      if (active === null || result === null) {
        receipt.status = "error";
        return await chainFailedPayload("discover", fallback);
      }
      receipt.provider = active;
      const urls = result.map((r) => r.url);
      receipt.selected_urls = urls;
      receipt.results_count = result.length;
      receipt.selected_count = result.length;
      if (active !== chain[0]) receipt.status = "degraded";
      return {
        ok: true,
        operation: "discover",
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
