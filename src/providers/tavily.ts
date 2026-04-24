/** Tavily — agent-friendly web search. POST https://api.tavily.com/search */

import {
  MissingKeyError,
  NormalizedResult,
  Provider,
  httpRequest,
  safeGet,
} from "./base.js";

export const ENDPOINT = "https://api.tavily.com/search";

export interface TavilySearchOptions {
  maxResults?: number;
  searchDepth?: "basic" | "advanced";
  topic?: "general" | "news";
  days?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
  country?: string;
  timeoutMs?: number;
}

export class TavilyProvider extends Provider {
  name = "tavily";
  schemaVersion = "tavily-v1-2026-04";
  apiKey: string | undefined;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey;
  }

  private ensureKey(): string {
    if (!this.apiKey) throw new MissingKeyError(this.name);
    return this.apiKey;
  }

  async search(query: string, opts: TavilySearchOptions = {}): Promise<NormalizedResult[]> {
    const body: Record<string, unknown> = {
      api_key: this.ensureKey(),
      query,
      max_results: opts.maxResults ?? 10,
      search_depth: opts.searchDepth ?? "basic",
    };
    if (opts.topic) body.topic = opts.topic;
    if (opts.days != null) body.days = opts.days;
    if (opts.includeDomains) body.include_domains = opts.includeDomains;
    if (opts.excludeDomains) body.exclude_domains = opts.excludeDomains;
    if (opts.country) body.country = opts.country;

    const response = await httpRequest(ENDPOINT, { method: "POST", body, timeoutMs: opts.timeoutMs });
    return this.normalize((response.json as Record<string, unknown>) ?? {});
  }

  normalize(payload: Record<string, unknown>): NormalizedResult[] {
    const results = (safeGet<unknown[]>(payload, ["results"], []) ?? []) as Array<Record<string, unknown>>;
    const out: NormalizedResult[] = [];
    for (const r of results) {
      const url = safeGet<string>(r, ["url"], "") ?? "";
      if (!url) continue;
      out.push(
        new NormalizedResult({
          url,
          title: safeGet<string>(r, ["title"], "") ?? "",
          snippet: safeGet<string>(r, ["content"], "") ?? "",
          score: toFloat(safeGet(r, ["score"])),
          publishedAt: safeGet<string>(r, ["published_date"]) ?? null,
          sourceKind: "web",
          provider: this.name,
          raw: r,
        }),
      );
    }
    return out;
  }
}

function toFloat(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
