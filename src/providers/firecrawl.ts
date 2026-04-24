/**
 * Firecrawl — clean a URL (scrape) or crawl a site.
 *
 * v0.2 implements scrape end-to-end, plus startCrawl/pollCrawl/crawl with a
 * bounded poll loop. ops/crawl.ts wraps it with the apply gates.
 */

import {
  FetchedPage,
  MissingKeyError,
  NormalizedResult,
  Provider,
  ProviderError,
  httpRequest,
  safeGet,
} from "./base.js";

export const BASE_URL = "https://api.firecrawl.dev/v1";

export interface ScrapeOptions {
  formats?: string[];
  onlyMainContent?: boolean;
  screenshot?: boolean;
  timeoutMs?: number;
}

export interface CrawlOptions {
  limit?: number;
  includePaths?: string[];
  excludePaths?: string[];
  formats?: string[];
  pollIntervalMs?: number;
  maxWaitMs?: number;
}

export class FirecrawlProvider extends Provider {
  name = "firecrawl";
  schemaVersion = "firecrawl-v1-2026-04";
  apiKey: string | undefined;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey;
  }

  private ensureKey(): string {
    if (!this.apiKey) throw new MissingKeyError(this.name);
    return this.apiKey;
  }

  private authHeaders(): Record<string, string> {
    return { authorization: `Bearer ${this.ensureKey()}` };
  }

  async scrape(url: string, opts: ScrapeOptions = {}): Promise<FetchedPage> {
    const formats = opts.formats?.length ? [...opts.formats] : ["markdown"];
    if (opts.screenshot && !formats.includes("screenshot")) formats.push("screenshot");
    const body: Record<string, unknown> = {
      url,
      formats,
      onlyMainContent: opts.onlyMainContent ?? true,
    };
    const response = await httpRequest(`${BASE_URL}/scrape`, {
      method: "POST",
      headers: this.authHeaders(),
      body,
      timeoutMs: opts.timeoutMs ?? 60_000,
    });
    return this.normalizeScrape((response.json as Record<string, unknown>) ?? {}, url);
  }

  private normalizeScrape(payload: Record<string, unknown>, requestedUrl: string): FetchedPage {
    if (!safeGet<boolean>(payload, ["success"], false)) {
      const err = safeGet<string>(payload, ["error"]) ?? "scrape failed";
      throw new ProviderError(`firecrawl: ${err}`);
    }
    const data = (safeGet<Record<string, unknown>>(payload, ["data"], {}) ?? {}) as Record<string, unknown>;
    const url = (safeGet<string>(data, ["metadata", "sourceURL"]) ?? requestedUrl) || requestedUrl;
    return new FetchedPage({
      url,
      title: safeGet<string>(data, ["metadata", "title"], "") ?? "",
      markdown: safeGet<string>(data, ["markdown"], "") ?? "",
      html: safeGet<string>(data, ["html"]) ?? null,
      metadata: (safeGet<Record<string, unknown>>(data, ["metadata"], {}) ?? {}) as Record<string, unknown>,
      provider: this.name,
      fetchedAt: safeGet<string>(data, ["metadata", "fetchTime"]) ?? null,
      status: "ok",
    });
  }

  async startCrawl(url: string, opts: CrawlOptions = {}): Promise<string> {
    const body: Record<string, unknown> = {
      url,
      limit: opts.limit ?? 10,
      scrapeOptions: { formats: opts.formats ?? ["markdown"] },
    };
    if (opts.includePaths) body.includePaths = opts.includePaths;
    if (opts.excludePaths) body.excludePaths = opts.excludePaths;
    const response = await httpRequest(`${BASE_URL}/crawl`, {
      method: "POST",
      headers: this.authHeaders(),
      body,
      timeoutMs: 60_000,
    });
    const payload = (response.json as Record<string, unknown>) ?? {};
    if (!safeGet<boolean>(payload, ["success"], false)) {
      throw new ProviderError(`firecrawl: crawl failed to start: ${JSON.stringify(safeGet(payload, ["error"]))}`);
    }
    const id = safeGet<string>(payload, ["id"]);
    if (!id) throw new ProviderError(`firecrawl: crawl response missing id`);
    return id;
  }

  async pollCrawl(jobId: string): Promise<Record<string, unknown>> {
    const response = await httpRequest(`${BASE_URL}/crawl/${jobId}`, {
      method: "GET",
      headers: this.authHeaders(),
      timeoutMs: 30_000,
    });
    return ((response.json as Record<string, unknown>) ?? {}) as Record<string, unknown>;
  }

  async crawl(url: string, opts: CrawlOptions = {}): Promise<FetchedPage[]> {
    const id = await this.startCrawl(url, opts);
    const interval = opts.pollIntervalMs ?? 2000;
    const deadline = Date.now() + (opts.maxWaitMs ?? 300_000);
    while (Date.now() < deadline) {
      const status = await this.pollCrawl(id);
      const state = safeGet<string>(status, ["status"]);
      if (state === "completed" || state === "failed") {
        if (state === "failed") {
          throw new ProviderError(`firecrawl: crawl ${id} failed: ${JSON.stringify(safeGet(status, ["error"]))}`);
        }
        const items = (safeGet<unknown[]>(status, ["data"], []) ?? []) as Array<Record<string, unknown>>;
        return items.map((item) => this.pageFromCrawlItem(item, id));
      }
      await sleep(interval);
    }
    throw new ProviderError(`firecrawl: crawl ${id} did not complete in ${opts.maxWaitMs ?? 300_000}ms`);
  }

  private pageFromCrawlItem(item: Record<string, unknown>, jobId: string): FetchedPage {
    const url = (safeGet<string>(item, ["metadata", "sourceURL"]) ?? safeGet<string>(item, ["url"]) ?? "") as string;
    return new FetchedPage({
      url,
      title: safeGet<string>(item, ["metadata", "title"], "") ?? "",
      markdown: safeGet<string>(item, ["markdown"], "") ?? "",
      html: safeGet<string>(item, ["html"]) ?? null,
      metadata: { crawl_job_id: jobId, ...(safeGet<Record<string, unknown>>(item, ["metadata"], {}) ?? {}) },
      provider: this.name,
      fetchedAt: safeGet<string>(item, ["metadata", "fetchTime"]) ?? null,
      status: "ok",
    });
  }

  searchResultsFromPages(pages: FetchedPage[]): NormalizedResult[] {
    return pages
      .filter((p) => p.url)
      .map(
        (p) =>
          new NormalizedResult({
            url: p.url,
            title: p.title || p.url,
            snippet: p.markdown.slice(0, 240),
            sourceKind: "web",
            provider: this.name,
          }),
      );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
