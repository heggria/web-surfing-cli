/** Tavily — agent-friendly web search. POST https://api.tavily.com/search */

import {
  FetchedPage,
  MissingKeyError,
  NormalizedResult,
  Provider,
  ProviderError,
  httpRequest,
  safeGet,
} from "./base.js";

export const ENDPOINT = "https://api.tavily.com/search";
export const EXTRACT_ENDPOINT = "https://api.tavily.com/extract";

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

export interface TavilyExtractOptions {
  extractDepth?: "basic" | "advanced";
  includeImages?: boolean;
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

/**
 * Tavily Extract — used as a fetch fallback between Firecrawl and stdlib urllib.
 * Cheaper than Firecrawl, often handles Cloudflare-protected pages where
 * stdlib fails. Same TAVILY_API_KEY as the search provider.
 */
export class TavilyExtractProvider extends Provider {
  name = "tavily-extract";
  schemaVersion = "tavily-extract-v1-2026-04";
  apiKey: string | undefined;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey;
  }

  private ensureKey(): string {
    if (!this.apiKey) throw new MissingKeyError(this.name);
    return this.apiKey;
  }

  async extract(url: string, opts: TavilyExtractOptions = {}): Promise<FetchedPage> {
    const body: Record<string, unknown> = {
      api_key: this.ensureKey(),
      urls: [url],
      extract_depth: opts.extractDepth ?? "basic",
      include_images: opts.includeImages ?? false,
    };
    const response = await httpRequest(EXTRACT_ENDPOINT, {
      method: "POST",
      body,
      timeoutMs: opts.timeoutMs ?? 45_000,
    });
    const payload = (response.json as Record<string, unknown>) ?? {};
    const results = (safeGet<unknown[]>(payload, ["results"], []) ?? []) as Array<Record<string, unknown>>;
    const failed = (safeGet<unknown[]>(payload, ["failed_results"], []) ?? []) as Array<Record<string, unknown>>;
    if (results.length === 0) {
      const reason = failed.length > 0 ? String(safeGet(failed[0], ["error"], "no content")) : "no content";
      throw new ProviderError(`tavily-extract: ${reason} for ${url}`);
    }
    const r = results[0]!;
    const raw = String(safeGet<string>(r, ["raw_content"], "") ?? "");
    const sourceUrl = String(safeGet<string>(r, ["url"], url) ?? url);
    if (!raw) throw new ProviderError(`tavily-extract: empty raw_content for ${url}`);
    return new FetchedPage({
      url: sourceUrl,
      title: deriveTitle(raw, sourceUrl),
      markdown: raw.slice(0, 200_000),
      provider: this.name,
      status: "degraded",
      metadata: { sourceURL: sourceUrl, extractDepth: opts.extractDepth ?? "basic" },
    });
  }
}

function deriveTitle(content: string, fallback: string): string {
  // Tavily returns plain text + extracted links. Try to grab the first
  // non-empty line; fall back to the URL.
  const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines[0]?.slice(0, 200) || fallback;
}

function toFloat(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
