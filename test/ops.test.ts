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

function withFakeFetch<T>(handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>, fn: () => Promise<T>): Promise<T> {
  const orig = globalThis.fetch;
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(typeof input === "string" ? input : (input as Request).url ?? String(input), init));
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
