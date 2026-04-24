/** Exa — semantic web search. POST https://api.exa.ai/search */

import {
  MissingKeyError,
  NormalizedResult,
  Provider,
  httpRequest,
  safeGet,
} from "./base.js";

export const ENDPOINT = "https://api.exa.ai/search";

export interface ExaSearchOptions {
  numResults?: number;
  type?: "neural" | "keyword" | "auto";
  category?: string;
  startPublishedDate?: string;
  endPublishedDate?: string;
  includeDomains?: string[];
  excludeDomains?: string[];
  timeoutMs?: number;
}

export class ExaProvider extends Provider {
  name = "exa";
  schemaVersion = "exa-v1-2026-04";
  apiKey: string | undefined;

  constructor(apiKey?: string) {
    super();
    this.apiKey = apiKey;
  }

  private ensureKey(): string {
    if (!this.apiKey) throw new MissingKeyError(this.name);
    return this.apiKey;
  }

  async search(query: string, opts: ExaSearchOptions = {}): Promise<NormalizedResult[]> {
    const body: Record<string, unknown> = {
      query,
      numResults: opts.numResults ?? 10,
    };
    if (opts.type) body.type = opts.type;
    if (opts.category) body.category = opts.category;
    if (opts.startPublishedDate) body.startPublishedDate = opts.startPublishedDate;
    if (opts.endPublishedDate) body.endPublishedDate = opts.endPublishedDate;
    if (opts.includeDomains) body.includeDomains = opts.includeDomains;
    if (opts.excludeDomains) body.excludeDomains = opts.excludeDomains;

    const response = await httpRequest(ENDPOINT, {
      method: "POST",
      headers: { "x-api-key": this.ensureKey() },
      body,
      timeoutMs: opts.timeoutMs,
    });
    return this.normalize((response.json as Record<string, unknown>) ?? {}, opts.category);
  }

  normalize(payload: Record<string, unknown>, category?: string): NormalizedResult[] {
    const results = (safeGet<unknown[]>(payload, ["results"], []) ?? []) as Array<Record<string, unknown>>;
    const kind = categoryToKind(category);
    const out: NormalizedResult[] = [];
    for (const r of results) {
      const url = safeGet<string>(r, ["url"], "") ?? "";
      if (!url) continue;
      const text = (safeGet<string>(r, ["text"]) ?? safeGet<string>(r, ["summary"]) ?? "") as string;
      out.push(
        new NormalizedResult({
          url,
          title: safeGet<string>(r, ["title"], "") ?? "",
          snippet: text,
          score: toFloat(safeGet(r, ["score"])),
          publishedAt: safeGet<string>(r, ["publishedDate"]) ?? null,
          sourceKind: kind,
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

function categoryToKind(category?: string): "doc" | "web" | "paper" | "code" | "company" {
  if (!category) return "web";
  const c = category.toLowerCase();
  if (c.includes("paper")) return "paper";
  if (c.includes("code") || c.includes("github")) return "code";
  if (c.includes("compan")) return "company";
  if (c.includes("person") || c.includes("people")) return "company";
  return "web";
}
