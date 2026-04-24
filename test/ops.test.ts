/** Op-level tests — fallback chains, receipt shape, redaction. */

import { describe, expect, test } from "bun:test";
import { setupTestEnv } from "./_setup.js";

setupTestEnv();
import { readFileSync } from "node:fs";
import * as audit from "../src/audit.js";
import * as crawlOp from "../src/ops/crawl.js";
import * as discoverOp from "../src/ops/discover.js";
import * as fetchOp from "../src/ops/fetch.js";
import * as planOp from "../src/ops/plan.js";
import * as searchOp from "../src/ops/search.js";
import * as verifyOp from "../src/ops/verify.js";

function withFakeFetch<T>(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  const fake = ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(
      handler(typeof input === "string" ? input : (input as Request).url ?? String(input), init),
    )) as unknown as typeof fetch;
  globalThis.fetch = fake;
  return fn().finally(() => {
    globalThis.fetch = orig;
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

// --- discover --------------------------------------------------------------

describe("discover.run", () => {
  test("uses Exa when key present", async () => {
    process.env.EXA_API_KEY = "exa_test";
    const calls: string[] = [];
    const out = await withFakeFetch(
      (url) => {
        calls.push(url);
        return jsonResponse({
          results: [{ url: "https://a.com", title: "A", score: 0.9, text: "..." }],
        });
      },
      () => discoverOp.run("alternatives to react", { numResults: 3 }),
    );
    expect(out.ok).toBe(true);
    expect(out.provider).toBe("exa");
    expect((out.fallback_chain as unknown[]).length).toBe(0);
    expect(out.status).toBe("ok");
    expect(calls.some((u) => u.includes("api.exa.ai"))).toBe(true);
  });

  test("falls back to Tavily when Exa missing key", async () => {
    process.env.TAVILY_API_KEY = "tvly_test";
    const out = await withFakeFetch(
      () =>
        jsonResponse({
          results: [{ url: "https://t.com", title: "T", content: "x" }],
        }),
      () => discoverOp.run("hello", { numResults: 2 }),
    );
    expect(out.ok).toBe(true);
    expect(out.provider).toBe("tavily");
    expect(out.status).toBe("degraded");
    const chain = out.fallback_chain as Array<{ from: string; reason: string }>;
    expect(chain[0]!.from).toBe("exa");
    expect(chain[0]!.reason).toBe("missing_key");
  });

  test("records receipt with fallback chain", async () => {
    process.env.TAVILY_API_KEY = "tvly_test";
    await withFakeFetch(
      () => jsonResponse({ results: [{ url: "https://t.com", title: "T", content: "x" }] }),
      () => discoverOp.run("hello"),
    );
    const events = (await audit.tail({ lines: 5 })).events;
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1]!;
    expect(last.op).toBe("discover");
    expect(last.provider).toBe("tavily");
    expect((last.fallback_chain as Array<{ from: string }>).some((s) => s.from === "exa")).toBe(true);
  });
});

// --- search ----------------------------------------------------------------

describe("search.run", () => {
  test("falls all the way to DuckDuckGo when only it is keyless-available", async () => {
    const out = await withFakeFetch(
      (url) => {
        if (url.includes("duckduckgo")) {
          return htmlResponse(
            '<a class="result__a" href="https://example.com/x">Example</a><a class="result__snippet" href="#">snippet</a>',
          );
        }
        return jsonResponse({});
      },
      () => searchOp.run("hello"),
    );
    expect(out.ok).toBe(true);
    expect(out.provider).toBe("duckduckgo");
    expect(out.status).toBe("degraded");
    const chain = out.fallback_chain as Array<{ from: string }>;
    expect(chain.some((s) => s.from === "tavily")).toBe(true);
    expect(chain.some((s) => s.from === "brave")).toBe(true);
  });
});

// --- fetch -----------------------------------------------------------------

describe("fetch.run", () => {
  test("uses Firecrawl when key present", async () => {
    process.env.FIRECRAWL_API_KEY = "fc_test";
    const payload = {
      success: true,
      data: { markdown: "# Page", metadata: { title: "Page", sourceURL: "https://example.com" } },
    };
    const out = await withFakeFetch(
      () => jsonResponse(payload),
      () => fetchOp.run("https://example.com"),
    );
    expect(out.ok).toBe(true);
    expect(out.provider).toBe("firecrawl");
    expect(out.status).toBe("ok");
  });

  test("falls back to urllib stdlib when Firecrawl missing", async () => {
    const out = await withFakeFetch(
      () => htmlResponse("<html><head><title>tiny</title></head><body>hello</body></html>"),
      () => fetchOp.run("https://example.com"),
    );
    expect(out.ok).toBe(true);
    expect(out.provider).toBe("urllib");
    expect(out.status).toBe("degraded");
    const chain = out.fallback_chain as Array<{ from: string }>;
    expect(chain.some((s) => s.from === "firecrawl")).toBe(true);
  });
});

// --- crawl gate ------------------------------------------------------------

describe("crawl.run gates", () => {
  test("blocks 50 pages without --apply", async () => {
    const out = await crawlOp.run("https://example.com", { maxPages: 50, apply: false });
    expect(out.ok).toBe(false);
    expect(String(out.error)).toContain("--apply");
    expect(out.returncode).toBe(2);
  });
  test("blocks 500 pages without --i-know-this-burns-credits", async () => {
    const out = await crawlOp.run("https://example.com", { maxPages: 500, apply: true, deepApply: false });
    expect(out.ok).toBe(false);
    expect(String(out.error)).toContain("--i-know-this-burns-credits");
  });
});

// --- plan ------------------------------------------------------------------

describe("plan.run", () => {
  test("explain prints decision and budget without provider call", () => {
    const out = planOp.explain("react useState");
    expect(out.ok).toBe(true);
    expect(out.operation).toBe("plan.explain");
    const d = out.decision as Record<string, unknown>;
    expect(d.recommended_op).toBe("docs");
  });

  test("dispatches react useState → docs", async () => {
    process.env.CONTEXT7_API_KEY = "ctx7_test";
    const out = await withFakeFetch(
      (url) => {
        if (url.includes("/api/v1/search")) {
          return jsonResponse({ results: [{ id: "/facebook/react", title: "React", description: "UI" }] });
        }
        if (url.includes("/api/v1/facebook/react")) {
          return new Response("# React docs\nuse hooks like this.", { status: 200, headers: { "content-type": "text/plain" } });
        }
        return jsonResponse({});
      },
      () => planOp.run("react useState"),
    );
    expect(out.ok).toBe(true);
    expect(out.dispatched_op).toBe("docs");
    const events = (await audit.tail({ lines: 5 })).events;
    const planEvents = events.filter((e) => e.op === "plan");
    expect(planEvents.length).toBeGreaterThan(0);
    expect((planEvents[planEvents.length - 1]!.route_decision as Record<string, unknown>).recommended_op).toBe("docs");
  });
});

// --- redaction in receipt --------------------------------------------------

describe("receipt redaction", () => {
  test("token in selected_urls is stripped before disk", async () => {
    process.env.EXA_API_KEY = "exa_test";
    await withFakeFetch(
      () =>
        jsonResponse({
          results: [{ url: "https://example.com/?token=SECRET&q=ok", title: "X", score: 0.5 }],
        }),
      () => discoverOp.run("hello"),
    );
    const raw = readFileSync(audit.auditPath(), "utf8");
    expect(raw).not.toContain("SECRET");
    expect(raw).toContain("q=ok");
  });
});

// --- cache --------------------------------------------------------------

describe("cache hit on repeat", () => {
  test("second search call with same query short-circuits to cache_hit=true", async () => {
    process.env.TAVILY_API_KEY = "tvly_test";
    let httpCalls = 0;
    const handler = () => {
      httpCalls += 1;
      return jsonResponse({
        results: [{ url: "https://a.com", title: "A", content: "x", score: 0.9 }],
      });
    };
    const first = await withFakeFetch(handler, () => searchOp.run("hello-cache-test"));
    expect(first.cache_hit).toBe(false);
    expect(first.provider).toBe("tavily");
    const second = await withFakeFetch(handler, () => searchOp.run("hello-cache-test"));
    expect(second.cache_hit).toBe(true);
    expect(second.provider).toBe("tavily");
    expect(httpCalls).toBe(1);
    const events = (await audit.tail({ lines: 5 })).events;
    const last = events[events.length - 1]!;
    expect(last.op).toBe("search");
    expect(last.cache_hit).toBe(true);
  });

  test("--no-cache (noCache opt) bypasses cache on both read and write", async () => {
    process.env.TAVILY_API_KEY = "tvly_test";
    let httpCalls = 0;
    const handler = () => {
      httpCalls += 1;
      return jsonResponse({
        results: [{ url: "https://a.com", title: "A", content: "x", score: 0.9 }],
      });
    };
    await withFakeFetch(handler, () => searchOp.run("nocache-q", { noCache: true }));
    const second = await withFakeFetch(handler, () => searchOp.run("nocache-q", { noCache: true }));
    expect(second.cache_hit).toBe(false);
    expect(httpCalls).toBe(2);
  });

  test("differing params produce distinct cache keys", async () => {
    process.env.TAVILY_API_KEY = "tvly_test";
    let httpCalls = 0;
    const handler = () => {
      httpCalls += 1;
      return jsonResponse({
        results: [{ url: "https://a.com", title: "A", content: "x", score: 0.9 }],
      });
    };
    await withFakeFetch(handler, () => searchOp.run("same-query", { timeRange: "day" }));
    await withFakeFetch(handler, () => searchOp.run("same-query", { timeRange: "week" }));
    expect(httpCalls).toBe(2);
  });
});

// --- corroborate (M1) ----------------------------------------------------

describe("search.run with --corroborate (parallel fan-out)", () => {
  test("fans out to N providers in parallel and merges with multi_source_evidence", async () => {
    process.env.TAVILY_API_KEY = "tvly_test";
    process.env.BRAVE_API_KEY = "brave_test";
    const seenHosts = new Set<string>();
    const handler = (url: string) => {
      seenHosts.add(new URL(url).hostname);
      if (url.includes("tavily.com")) {
        return jsonResponse({
          results: [
            { url: "https://example.com/x", title: "X (tavily)", content: "from tavily", score: 0.9 },
            { url: "https://example.com/only-tavily", title: "T-only", content: "...", score: 0.5 },
          ],
        });
      }
      if (url.includes("brave.com")) {
        return jsonResponse({
          web: {
            results: [
              { url: "https://example.com/x", title: "X (brave)", description: "from brave" },
              { url: "https://example.com/only-brave", title: "B-only", description: "..." },
            ],
          },
        });
      }
      return jsonResponse({});
    };
    const out = await withFakeFetch(handler, () => searchOp.run("corroborate-test", { corroborate: 2, maxResults: 5 }));
    expect(out.ok).toBe(true);
    expect(out.cache_hit).toBe(false);
    const evidence = out.multi_source_evidence as Array<{ provider: string }>;
    expect(evidence.length).toBe(2);
    expect(evidence.map((e) => e.provider).sort()).toEqual(["brave", "tavily"]);
    // Both providers were hit.
    expect(seenHosts.has("api.tavily.com")).toBe(true);
    expect(seenHosts.has("api.search.brave.com")).toBe(true);
    // The shared URL should be first (higher corroboration count).
    const results = out.results as Array<Record<string, unknown>>;
    expect(results.length).toBe(3);
    expect(results[0]!.url).toBe("https://example.com/x");
    expect(results[0]!.corroborated_by).toEqual(["brave"]);
  });

  test("receipt records multi_source_evidence and is queryable via --high-confidence", async () => {
    process.env.TAVILY_API_KEY = "tvly_test";
    process.env.BRAVE_API_KEY = "brave_test";
    const handler = (url: string) => {
      if (url.includes("tavily.com")) {
        return jsonResponse({ results: [{ url: "https://a.com", title: "A", content: "...", score: 0.5 }] });
      }
      if (url.includes("brave.com")) {
        return jsonResponse({ web: { results: [{ url: "https://a.com", title: "A", description: "..." }] } });
      }
      return jsonResponse({});
    };
    await withFakeFetch(handler, () => searchOp.run("hi-conf-test", { corroborate: 2 }));
    const events = (await audit.tail({ lines: 5 })).events;
    const last = events[events.length - 1]!;
    expect(last.op).toBe("search");
    expect((last.multi_source_evidence as unknown[])?.length).toBe(2);
    const sum = await audit.summary({ days: 1, highConfidence: true });
    expect(sum.high_confidence_events?.length).toBeGreaterThan(0);
  });

  test("only one provider available → degraded status", async () => {
    process.env.TAVILY_API_KEY = "tvly_test";
    // brave NOT set
    const handler = (url: string) => {
      if (url.includes("tavily.com")) {
        return jsonResponse({ results: [{ url: "https://a.com", title: "A", content: "...", score: 0.5 }] });
      }
      return jsonResponse({});
    };
    const out = await withFakeFetch(handler, () => searchOp.run("solo-fan", { corroborate: 3 }));
    expect(out.ok).toBe(true);
    expect(out.status).toBe("degraded");
    const evidence = out.multi_source_evidence as Array<unknown>;
    expect(evidence.length).toBe(1);
  });
});

// --- batch fetch + verify (M2) -------------------------------------------

describe("fetch.runMany (batch)", () => {
  test("fetches multiple URLs concurrently and produces sha256 per URL", async () => {
    process.env.FIRECRAWL_API_KEY = "fc_test";
    const handler = (url: string) => {
      // Decode the URL parameter from Firecrawl request body — but our fake
      // doesn't parse body; just respond with deterministic markdown per URL.
      if (url.includes("api.firecrawl.dev")) {
        return jsonResponse({
          success: true,
          data: { markdown: `# fake page ${Math.random()}`, metadata: { title: "T", sourceURL: "https://x.com" } },
        });
      }
      return jsonResponse({});
    };
    const out = await withFakeFetch(handler, () =>
      fetchOp.runMany(["https://a.com", "https://b.com", "https://c.com"], { concurrency: 4 }),
    );
    expect(out.ok).toBe(true);
    expect(out.operation).toBe("batch_fetch");
    const urls = out.urls as Array<{ url: string; sha256: string | null; status: string }>;
    expect(urls.length).toBe(3);
    expect(urls.every((u) => typeof u.sha256 === "string" && u.sha256.length === 64)).toBe(true);
    const counts = out.counts as Record<string, number>;
    expect(counts.total).toBe(3);
  });

  test("writes a parent batch_fetch receipt with urls[] details", async () => {
    process.env.FIRECRAWL_API_KEY = "fc_test";
    const handler = (url: string) => {
      if (url.includes("api.firecrawl.dev")) {
        return jsonResponse({
          success: true,
          data: { markdown: "body", metadata: { title: "T", sourceURL: "https://x.com" } },
        });
      }
      return jsonResponse({});
    };
    await withFakeFetch(handler, () => fetchOp.runMany(["https://a.com", "https://b.com"]));
    const events = (await audit.tail({ lines: 50 })).events;
    const batch = events.filter((e) => e.op === "batch_fetch");
    expect(batch.length).toBeGreaterThan(0);
    const last = batch[batch.length - 1]!;
    const lastUrls = last.urls as Array<{ url: string; sha256?: string }>;
    expect(lastUrls.length).toBe(2);
    expect(lastUrls.every((u) => typeof u.sha256 === "string")).toBe(true);
    // Children: 2 fetch receipts whose parent_call_id points to the batch.
    const children = events.filter((e) => e.op === "fetch" && e.parent_call_id === last.call_id);
    expect(children.length).toBe(2);
  });
});

describe("verify.run", () => {
  test("verifies positional URLs and returns sha256 + fetched_at", async () => {
    process.env.FIRECRAWL_API_KEY = "fc_test";
    const handler = (url: string) => {
      if (url.includes("api.firecrawl.dev")) {
        return jsonResponse({
          success: true,
          data: { markdown: "page body", metadata: { title: "Title", sourceURL: "https://example.com" } },
        });
      }
      return jsonResponse({});
    };
    const out = await withFakeFetch(handler, () => verifyOp.run(["https://example.com/a", "https://example.com/b"]));
    expect(out.ok).toBe(true);
    expect(out.operation).toBe("verify");
    const urls = out.urls as Array<{ url: string; sha256: string; fetched_at: string; status: string }>;
    expect(urls.length).toBe(2);
    expect(urls.every((u) => typeof u.sha256 === "string" && u.sha256.length === 64)).toBe(true);
    expect(urls.every((u) => typeof u.fetched_at === "string")).toBe(true);
    // Receipt has op=verify (not batch_fetch).
    const events = (await audit.tail({ lines: 10 })).events;
    const verifyEvents = events.filter((e) => e.op === "verify");
    expect(verifyEvents.length).toBeGreaterThan(0);
  });

  test("--from-receipt loads selected_urls from a prior call", async () => {
    process.env.TAVILY_API_KEY = "tvly_test";
    process.env.FIRECRAWL_API_KEY = "fc_test";
    const handler = (url: string) => {
      if (url.includes("tavily.com")) {
        return jsonResponse({
          results: [
            { url: "https://prior.com/x", title: "X", content: "..." },
            { url: "https://prior.com/y", title: "Y", content: "..." },
          ],
        });
      }
      if (url.includes("api.firecrawl.dev")) {
        return jsonResponse({
          success: true,
          data: { markdown: "body", metadata: { title: "T", sourceURL: "https://prior.com" } },
        });
      }
      return jsonResponse({});
    };
    const searchResult = await withFakeFetch(handler, () => searchOp.run("from-receipt-test"));
    const events = (await audit.tail({ lines: 10 })).events;
    const searchEvent = events.filter((e) => e.op === "search").pop();
    expect(searchEvent).toBeDefined();
    const callId = searchEvent!.call_id;
    void searchResult;
    const verifyResult = await withFakeFetch(handler, () => verifyOp.run([], { fromReceipt: callId }));
    expect(verifyResult.ok).toBe(true);
    const urls = verifyResult.urls as Array<{ url: string; sha256: string }>;
    expect(urls.length).toBe(2);
    expect(urls[0]!.url).toBe("https://prior.com/x");
  });

  test("missing --from-receipt or URLs yields error", async () => {
    const out = await verifyOp.run([]);
    expect(out.ok).toBe(false);
    expect(out.returncode).toBe(2);
  });

  test("--from-receipt with unknown call_id yields error", async () => {
    const out = await verifyOp.run([], { fromReceipt: "nope-not-real" });
    expect(out.ok).toBe(false);
    expect(out.returncode).toBe(2);
    expect(String(out.error)).toContain("nope-not-real");
  });
});
