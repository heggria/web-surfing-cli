/**
 * DuckDuckGo — zero-key fallback search via the HTML endpoint.
 * Always degraded: results lack scores, HTML structure may shift, and DDG
 * actively fingerprints non-browser clients (POST and bare UAs get a 202
 * challenge page, GET with a real browser UA gets the real results).
 */

import { NormalizedResult, Provider, httpRequest } from "./base.js";

export const ENDPOINT = "https://duckduckgo.com/html/";

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const RESULT_RE = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
const SNIPPET_RE = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
const TAG_RE = /<[^>]+>/g;
const DDG_REDIRECT_RE = /^(?:https?:)?\/\/duckduckgo\.com\/l\/\?uddg=([^&]+)/i;

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITY_MAP[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)));
}

function stripHtml(s: string): string {
  return decodeEntities(s.replace(TAG_RE, "")).trim();
}

function followRedirect(url: string): string {
  const m = DDG_REDIRECT_RE.exec(url);
  if (m && m[1]) return decodeURIComponent(m[1]);
  if (url.startsWith("//")) return `https:${url}`;
  return url;
}

export class DuckDuckGoProvider extends Provider {
  name = "duckduckgo";
  schemaVersion = "ddg-html-v1-2026-04";
  // Accept an apiKey for registry parity; ignored.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_apiKey?: string) {
    super();
  }

  async search(query: string, opts: { count?: number; timeoutMs?: number } = {}): Promise<NormalizedResult[]> {
    const response = await httpRequest(ENDPOINT, {
      method: "GET",
      // Browser headers; without these DDG returns a 202 challenge page that
      // looks like the homepage (no result anchors).
      headers: {
        "user-agent": BROWSER_UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
        "accept-language": "en-US,en;q=0.9",
        "accept-encoding": "identity",
      },
      params: { q: query },
      timeoutMs: opts.timeoutMs,
    });
    return this.normalize(response.text ?? "", opts.count ?? 10);
  }

  normalize(htmlText: string, limit = 10): NormalizedResult[] {
    if (!htmlText) return [];
    const urls: Array<[string, string]> = [];
    let m: RegExpExecArray | null;
    const reUrls = new RegExp(RESULT_RE.source, RESULT_RE.flags);
    while ((m = reUrls.exec(htmlText)) !== null) urls.push([m[1] ?? "", m[2] ?? ""]);
    const snippets: string[] = [];
    const reSnips = new RegExp(SNIPPET_RE.source, SNIPPET_RE.flags);
    while ((m = reSnips.exec(htmlText)) !== null) snippets.push(m[1] ?? "");

    const out: NormalizedResult[] = [];
    for (let i = 0; i < Math.min(urls.length, limit); i++) {
      const [rawUrl, titleHtml] = urls[i] as [string, string];
      const url = followRedirect(rawUrl);
      if (!url) continue;
      out.push(
        new NormalizedResult({
          url,
          title: stripHtml(titleHtml),
          snippet: i < snippets.length ? stripHtml(snippets[i] ?? "") : "",
          score: null,
          sourceKind: "web",
          provider: this.name,
        }),
      );
    }
    return out;
  }
}
