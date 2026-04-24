import { describe, expect, test } from "bun:test";
import { setupTestEnv } from "./_setup.js";

setupTestEnv();
import { LlmRouter, RuleRouter, getRouter } from "../src/routing.js";

const router = new RuleRouter();

const CASES: Array<[string, string]> = [
  // Library docs
  ["react useState", "docs"],
  ["react hooks", "docs"],
  ["next.js middleware auth", "docs"],
  ["tailwind dark mode setup", "docs"],
  ["kotlin coroutines tutorial", "docs"],
  ["fastapi background tasks", "docs"],
  ["openai api docs", "docs"],
  ["anthropic prompt caching", "docs"],
  ["tokio runtime explained", "docs"],
  ["supabase auth row level security", "docs"],
  // URL → fetch / crawl
  ["https://docs.anthropic.com/claude/docs", "fetch"],
  ["HTTPS://Example.com/path?token=x", "fetch"],
  ["https://docs.firecrawl.dev/*", "crawl"],
  ["https://example.com/section/**", "crawl"],
  // Discovery
  ["alternatives to react", "discover"],
  ["react vs vue", "discover"],
  ["fastapi vs flask", "discover"],
  ["compare prisma and drizzle", "discover"],
  ["find me papers on speculative decoding", "discover"],
  ["research papers about diffusion models", "discover"],
  ["libraries like firecrawl", "discover"],
  ["similar to Hermit governed agent runtime", "discover"],
  ["competitors of langchain", "discover"],
  // Web facts / news
  ["claude 4.7 latest features", "search"],
  ["news on apple m4 mac mini", "search"],
  ["supabase pricing", "search"],
  ["best frontend framework 2026", "search"],
  ["openai release notes", "search"],
  ["what's the price of gpt-5", "search"],
  // Default fallback
  ["hello", "search"],
  ["", "search"],
  ["ECC eval-driven development", "search"],
];

describe("RuleRouter classification", () => {
  for (const [query, expected] of CASES) {
    test(`${JSON.stringify(query)} → ${expected}`, () => {
      const d = router.classify(query);
      if (d.recommended_op !== expected) {
        // attach the rules that fired so the failure message is actionable
        throw new Error(
          `expected ${expected}, got ${d.recommended_op}\nrules_fired=${JSON.stringify(d.rules_fired)}`,
        );
      }
      expect(d.recommended_op).toBe(expected);
    });
  }
});

describe("RuleRouter ambiguity & shape", () => {
  test("library + time hits both sides → ambiguous, conf clamped", () => {
    const d = router.classify("react latest version");
    expect(d.ambiguous).toBe(true);
    expect(d.confidence).toBeLessThanOrEqual(0.5);
    expect(d.why_not.length).toBeGreaterThan(0);
  });

  test("emits the documented schema", () => {
    const d = router.classify("react useState");
    for (const k of [
      "intent",
      "classifier_version",
      "recommended_op",
      "recommended_provider",
      "confidence",
      "ambiguous",
      "rationale",
      "rules_fired",
      "why_not",
      "search_budget",
    ] as const) {
      expect(d[k]).not.toBeUndefined();
    }
    expect(d.classifier_version).toBe("rule-v1");
    expect(d.recommended_provider).toBe("context7");
  });

  test("default fallback rationale", () => {
    const d = router.classify("hello");
    expect(d.rationale.toLowerCase()).toContain("default");
    expect(d.search_budget).toBe(1);
  });

  test("prefer=deep increases budget", () => {
    const d = router.classify("react useState", { prefer: "deep" });
    expect(d.search_budget).toBeGreaterThanOrEqual(3);
  });

  test("explicit budget override wins", () => {
    const d = router.classify("react useState", { budgetOverride: 7 });
    expect(d.search_budget).toBe(7);
  });
});

describe("getRouter", () => {
  test("default returns RuleRouter", () => {
    expect(getRouter()).toBeInstanceOf(RuleRouter);
  });
  test("llm returns LlmRouter scaffold (throws on classify)", () => {
    const r = getRouter("llm");
    expect(r).toBeInstanceOf(LlmRouter);
    expect(() => r.classify("anything")).toThrow();
  });
  test("unknown router throws", () => {
    expect(() => getRouter("astrology" as never)).toThrow();
  });
});
