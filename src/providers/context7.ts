/**
 * Context7 — official library docs lookup.
 *
 * REST surface alongside the MCP server:
 *   GET https://context7.com/api/v1/search?query=<lib>
 *   GET https://context7.com/api/v1/<library_id>?topic=<x>&type=txt&tokens=<n>
 *
 * Free tier works without a key (rate-limited). Authenticated requests use
 * Authorization: Bearer.
 */

import {
  FetchedPage,
  NormalizedResult,
  Provider,
  ProviderError,
  httpRequest,
  safeGet,
} from "./base.js";

export const BASE_URL = "https://context7.com/api/v1";

export interface GetDocsOptions {
  topic?: string;
  tokens?: number;
  timeoutMs?: number;
}

export class Context7Provider extends Provider {
  name = "context7";
  schemaVersion = "context7-v1-2026-04";
  apiKey: string | undefined;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { accept: "application/json" };
    if (this.apiKey) h.authorization = `Bearer ${this.apiKey}`;
    return h;
  }

  async resolveLibrary(library: string, opts: { timeoutMs?: number } = {}): Promise<NormalizedResult[]> {
    const response = await httpRequest(`${BASE_URL}/search`, {
      method: "GET",
      headers: this.headers(),
      params: { query: library },
      timeoutMs: opts.timeoutMs ?? 20_000,
    });
    return this.normalizeSearch((response.json as Record<string, unknown>) ?? {});
  }

  normalizeSearch(payload: Record<string, unknown>): NormalizedResult[] {
    const results = (safeGet<unknown[]>(payload, ["results"], []) ?? []) as Array<Record<string, unknown>>;
    const out: NormalizedResult[] = [];
    for (const r of results) {
      const libId = (safeGet<string>(r, ["id"]) ?? safeGet<string>(r, ["libraryId"]) ?? "") as string;
      if (!libId) continue;
      const url = `${BASE_URL}${libId.startsWith("/") ? libId : "/" + libId}`;
      out.push(
        new NormalizedResult({
          url,
          title: safeGet<string>(r, ["title"], libId) ?? libId,
          snippet: safeGet<string>(r, ["description"], "") ?? "",
          sourceKind: "doc",
          provider: this.name,
          raw: r,
        }),
      );
    }
    return out;
  }

  async getDocs(libraryId: string, opts: GetDocsOptions = {}): Promise<FetchedPage> {
    const id = libraryId.startsWith("/") ? libraryId : "/" + libraryId;
    const params: Record<string, string> = { type: "txt", tokens: String(opts.tokens ?? 4000) };
    if (opts.topic) params.topic = opts.topic;
    const url = `${BASE_URL}${id}`;
    const response = await httpRequest(url, {
      method: "GET",
      headers: this.headers(),
      params,
      timeoutMs: opts.timeoutMs ?? 30_000,
    });
    const text = response.text ?? "";
    if (!text.trim()) {
      throw new ProviderError(`context7: empty docs response for ${id}`);
    }
    return new FetchedPage({
      url,
      title: id.replace(/^\//, ""),
      markdown: text,
      metadata: { library_id: id, topic: opts.topic ?? null, tokens: opts.tokens ?? 4000 },
      provider: this.name,
      status: "ok",
    });
  }
}
