/**
 * Routing — turn a free-form query into a tool/provider decision.
 *
 * RuleRouter is pure rules over the query string (no I/O, no env reads, no
 * model). It is the default and the only one wired in v0.2.
 *
 * LlmRouter is a Protocol scaffold for an opt-in LLM-backed classifier;
 * v0.2 throws "not implemented", v0.3 will plug in Haiku-tier routing.
 */

// --- Rule corpus ----------------------------------------------------------

export const KNOWN_LIBRARIES = new Set<string>([
  // JS/TS
  "react", "vue", "svelte", "solid", "next", "nuxt", "remix", "astro",
  "vite", "esbuild", "webpack", "turbopack", "rollup",
  "tailwind", "shadcn", "chakra", "mantine", "radix",
  "node", "nodejs", "bun", "deno",
  "express", "fastify", "hono", "nestjs", "koa", "elysia",
  "tanstack", "react-query", "zustand", "redux", "jotai", "valtio", "recoil",
  "trpc", "drizzle", "prisma", "knex", "mongoose", "typeorm",
  // Python
  "django", "flask", "fastapi", "starlette", "litestar", "pydantic",
  "sqlalchemy", "alembic", "celery", "huey",
  "pandas", "numpy", "polars", "scikit-learn", "scipy",
  // Go / Rust / JVM / Swift / etc.
  "axum", "actix", "tokio", "rocket", "tonic",
  "spring", "quarkus", "ktor", "exposed",
  "swiftui", "uikit", "vapor",
  // AI / Cloud
  "anthropic", "openai", "langchain", "llamaindex", "ollama",
  "supabase", "firebase", "convex", "neon", "planetscale",
  // Tooling
  "git", "docker", "kubernetes", "k8s", "terraform", "pulumi",
  "pytest", "jest", "vitest", "playwright", "cypress",
  // Languages
  "kotlin", "swift", "rust", "golang", "python", "typescript", "javascript",
  // Editors / Agents
  "claude-code", "cursor", "codex", "opencode",
]);

const DISCOVERY_PATTERNS: RegExp[] = [
  /\balternatives?\s+to\b/i,
  /\bsimilar\s+to\b/i,
  /\b(vs\.?|versus)\b/i,
  /\b(find\s+me|find|look\s+up)\s+(papers?|projects?|libraries?|tools?|companies?|people)\b/i,
  /\b(papers?|research)\s+(on|about)\b/i,
  /\b(competitors?|comparison|landscape|survey)\b/i,
  /\b(libraries?|tools?|projects?)\s+like\b/i,
  /\b(compare|comparing|differences?\s+between)\b/i,
  // M4 v0.3: route community / opinion / discussion intents to discover so
  // the user gets the semantic neighbors instead of a generic web search.
  /\b(discussions?|opinions?|reactions?|takes?|community|voices?|sentiment|hot\s+takes?|critiques?)\b/i,
  /\bwhat\s+(do|are)\s+people\s+(saying|think)\b/i,
];

const TIME_PATTERNS: RegExp[] = [
  /\b(today|tonight|tomorrow|yesterday|now|currently|recent(ly)?|latest|news|updates?|changelog|release\s+notes?|roadmap|announcement)\b/i,
  /\b20[2-9]\d\b/,
  /\b(price|pricing|cost|fees?)\b/i,
  /\bversion\s+\d/i,
];

const URL_RE = /^\s*https?:\/\//i;

// --- Decision schema ------------------------------------------------------

export type RouteOp = "docs" | "discover" | "fetch" | "crawl" | "search";
export type RouteIntent = "library_docs" | "semantic_discovery" | "url_fetch" | "url_crawl" | "web_facts";

export interface RouteDecision {
  intent: RouteIntent;
  classifier_version: string;
  recommended_op: RouteOp;
  recommended_provider: string;
  confidence: number;
  ambiguous: boolean;
  rationale: string;
  rules_fired: string[];
  why_not: Array<{ op: string; reason: string }>;
  search_budget: number;
}

const OP_TO_PROVIDER: Record<RouteOp, string> = {
  docs: "context7",
  discover: "exa",
  fetch: "firecrawl",
  crawl: "firecrawl",
  search: "tavily",
};

const OP_TO_INTENT: Record<RouteOp, RouteIntent> = {
  docs: "library_docs",
  discover: "semantic_discovery",
  fetch: "url_fetch",
  crawl: "url_crawl",
  search: "web_facts",
};

export interface Router {
  classifierVersion: string;
  classify(query: string, context?: { prefer?: "fast" | "deep"; budgetOverride?: number | null }): RouteDecision;
}

interface Candidate {
  op: RouteOp;
  confidence: number;
  reason: string;
}

export class RuleRouter implements Router {
  classifierVersion = "rule-v1";

  classify(
    query: string,
    context: { prefer?: "fast" | "deep"; budgetOverride?: number | null } = {},
  ): RouteDecision {
    const q = (query ?? "").trim();
    const candidates: Candidate[] = [];

    // 1. URL → fetch (or crawl, if user typed a wildcard / trailing /*).
    if (URL_RE.test(q)) {
      const op: RouteOp = q.endsWith("/*") || q.includes("/**") ? "crawl" : "fetch";
      candidates.push({ op, confidence: 0.95, reason: `url_detected → ${op}` });
    }

    // 2. Known libraries.
    const tokens = (q.toLowerCase().match(/[a-z][a-z0-9_-]+/g) ?? []) as string[];
    const libraryHits = tokens.filter((t) => KNOWN_LIBRARIES.has(t));
    const discoveryHit = DISCOVERY_PATTERNS.some((p) => p.test(q));
    const timeHit = TIME_PATTERNS.some((p) => p.test(q));

    if (libraryHits.length > 0 && discoveryHit) {
      candidates.push({
        op: "discover",
        confidence: 0.85,
        reason: `library(${libraryHits[0]}) + discovery_phrase`,
      });
    } else if (libraryHits.length > 0 && timeHit) {
      candidates.push({
        op: "search",
        confidence: 0.75,
        reason: `time_phrase + library(${libraryHits[0]}) → current state`,
      });
      candidates.push({
        op: "docs",
        confidence: 0.7,
        reason: `library(${libraryHits[0]}) (alt: docs may also have it)`,
      });
    } else if (libraryHits.length > 0) {
      candidates.push({ op: "docs", confidence: 0.85, reason: `library_hit(${libraryHits[0]})` });
    }

    if (discoveryHit && libraryHits.length === 0) {
      candidates.push({ op: "discover", confidence: 0.8, reason: "discovery_phrase" });
    }

    if (timeHit && libraryHits.length === 0) {
      candidates.push({ op: "search", confidence: 0.75, reason: "time_phrase" });
    }

    if (candidates.length === 0) {
      candidates.push({ op: "search", confidence: 0.4, reason: "default_fallback" });
    }

    candidates.sort((a, b) => b.confidence - a.confidence);
    const chosen = candidates[0]!;

    const strong = candidates.filter((c) => c.confidence >= 0.5);
    const uniqueOps = new Set(strong.map((c) => c.op));
    const ambiguous = uniqueOps.size > 1;
    const confidence = ambiguous ? Math.min(chosen.confidence, 0.5) : chosen.confidence;

    const why_not = candidates
      .slice(1)
      .filter((c) => c.op !== chosen.op)
      .map((c) => ({ op: c.op as string, reason: c.reason }));

    let budget = 1;
    if (ambiguous) budget = 2;
    if (context.prefer === "deep") budget = Math.max(budget, 3);
    if (context.budgetOverride != null) budget = context.budgetOverride;

    return {
      intent: OP_TO_INTENT[chosen.op],
      classifier_version: this.classifierVersion,
      recommended_op: chosen.op,
      recommended_provider: OP_TO_PROVIDER[chosen.op],
      confidence: round2(confidence),
      ambiguous,
      rationale: chosen.reason,
      rules_fired: candidates.map((c) => `${c.op}(${c.confidence.toFixed(2)}): ${c.reason}`),
      why_not,
      search_budget: budget,
    };
  }
}

export class LlmRouter implements Router {
  classifierVersion = "llm-haiku-v1";

  classify(): RouteDecision {
    throw new Error("LlmRouter ships in v0.3. Use RuleRouter (default) for now.");
  }
}

export function getRouter(name: "rule" | "llm" = "rule"): Router {
  if (name === "rule") return new RuleRouter();
  if (name === "llm") return new LlmRouter();
  throw new Error(`unknown router: ${name as string} (use rule|llm)`);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
