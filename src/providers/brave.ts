/**
 * Brave Search — REST web search.
 * GET https://api.search.brave.com/res/v1/web/search
 *
 * Note: Brave is a peer search provider, not a zero-key fallback.
 */

import {
  MissingKeyError,
  NormalizedResult,
  Provider,
  httpRequest,
  safeGet,
} from "./base.js";

export const ENDPOINT = "https://api.search.brave.com/res/v1/web/search";

export interface BraveSearchOptions {
  count?: number;
  country?: string;
  freshness?: "pd" | "pw" | "pm" | "py";
  /** Brave has no native include_domains; we inject `site:a OR site:b` into q. */
  includeDomains?: string[];
  timeoutMs?: number;
}

export class BraveProvider extends Provider {
  name = "brave";
  schemaVersion = "brave-v1-2026-04";
  apiKey: string | undefined;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey;
  }

  private ensureKey(): string {
    if (!this.apiKey) throw new MissingKeyError(this.name);
    return this.apiKey;
  }

  async search(query: string, opts: BraveSearchOptions = {}): Promise<NormalizedResult[]> {
    let q = query;
    if (opts.includeDomains && opts.includeDomains.length > 0) {
      const sites = opts.includeDomains.map((d) => `site:${d}`).join(" OR ");
      q = `(${sites}) ${query}`;
    }
    const params: Record<string, string> = { q, count: String(opts.count ?? 10) };
    if (opts.country) params.country = opts.country;
    if (opts.freshness) params.freshness = opts.freshness;
    const response = await httpRequest(ENDPOINT, {
      method: "GET",
      headers: { "x-subscription-token": this.ensureKey(), accept: "application/json" },
      params,
      timeoutMs: opts.timeoutMs,
    });
    return this.normalize((response.json as Record<string, unknown>) ?? {});
  }

  normalize(payload: Record<string, unknown>): NormalizedResult[] {
    const results = (safeGet<unknown[]>(payload, ["web", "results"], []) ?? []) as Array<Record<string, unknown>>;
    const out: NormalizedResult[] = [];
    for (const r of results) {
      const url = safeGet<string>(r, ["url"], "") ?? "";
      if (!url) continue;
      out.push(
        new NormalizedResult({
          url,
          title: safeGet<string>(r, ["title"], "") ?? "",
          snippet: safeGet<string>(r, ["description"], "") ?? "",
          score: null,
          publishedAt: safeGet<string>(r, ["page_age"]) ?? null,
          sourceKind: "web",
          provider: this.name,
          raw: r,
        }),
      );
    }
    return out;
  }
}
