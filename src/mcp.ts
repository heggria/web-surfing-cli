/**
 * wsc MCP server — exposes the wsc ops as MCP tools so any MCP-aware agent
 * (Claude Code, Claude Desktop, opencode, codex, Cursor, Cline, Continue, ...)
 * gets the same routing-policy-driven web research, with the routing /
 * citation / confidence guidance embedded in each tool's description.
 *
 * Run via `wsc mcp` (stdio JSON-RPC). Configure once per agent and forget.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { tail as auditTail } from "./audit.js";
import * as cacheMod from "./cache.js";
import { resolveIncludeDomains } from "./domains.js";
import * as deepdiveOp from "./ops/deepdive.js";
import * as discoverOp from "./ops/discover.js";
import * as docsOp from "./ops/docs.js";
import * as fetchOp from "./ops/fetch.js";
import * as planOp from "./ops/plan.js";
import * as searchOp from "./ops/search.js";
import * as verifyOp from "./ops/verify.js";

// --- Tool registry --------------------------------------------------------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const TOOLS: ToolDef[] = [
  {
    name: "wsc_plan",
    description:
      "Auto-route a query to the right tool. Use when the intent is ambiguous and you want the rule router to pick docs/discover/search/fetch/crawl. Set explain=true to print the routing decision without spending API credits.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The user's research query, or a URL." },
        explain: { type: "boolean", description: "Show the routing decision only; do not dispatch.", default: false },
      },
      required: ["query"],
    },
  },
  {
    name: "wsc_search",
    description:
      "General web search via Tavily (with Brave/DDG fallback). Use for current facts, news, pricing, release notes, version numbers. " +
      "IMPORTANT: result URLs are PROVIDER SNIPPETS, not fetched pages — do NOT cite them in writeups without first running wsc_verify (or use wsc_deepdive instead). " +
      "Add corroborate>=2 to fan out to multiple providers in parallel for cross-validated, high-confidence results on claims that would be embarrassing to be wrong about (versions, prices, releases).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        max_results: { type: "number", description: "Default 10, max 50." },
        time_range: {
          type: "string",
          enum: ["day", "week", "month", "year"],
          description: "Restrict to recent results.",
        },
        country: { type: "string", description: "Geo bias (e.g., 'US')." },
        corroborate: {
          type: "number",
          minimum: 2,
          description: "Fan out to N providers in parallel; merge by URL; mark cross-validated ones with corroborated_by[]. Costs N× a single call.",
        },
        include_domains: {
          type: "array",
          items: { type: "string" },
          description: "Restrict to these domains (Tavily include_domains; Brave site: injection).",
        },
        source: {
          type: "string",
          description: "Preset domain shortcut: hn|reddit|x|gh|so|arxiv. Combine with +, e.g. 'hn+reddit'.",
        },
        no_cache: { type: "boolean", description: "Bypass the response cache." },
      },
      required: ["query"],
    },
  },
  {
    name: "wsc_discover",
    description:
      "Semantic discovery via Exa. Use for 'alternatives to X', 'similar to Y', research papers, communities, discussions/opinions. " +
      "Result URLs are PROVIDER SNIPPETS — verify before citing.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        type: {
          type: "string",
          enum: ["code", "paper", "company", "people"],
          description: "Optional Exa category filter.",
        },
        since_days: { type: "number", description: "Restrict to last N days (Exa startPublishedDate)." },
        num_results: { type: "number", description: "Default 10." },
        corroborate: {
          type: "number",
          minimum: 2,
          description: "Parallel fan-out + cross-validation across providers.",
        },
        include_domains: { type: "array", items: { type: "string" } },
        source: { type: "string", description: "Preset shortcut: hn|reddit|x|gh|so|arxiv (combine with +)." },
        no_cache: { type: "boolean" },
      },
      required: ["query"],
    },
  },
  {
    name: "wsc_fetch",
    description:
      "Fetch URL(s) and return clean markdown via Firecrawl (Tavily Extract / stdlib urllib fallback). " +
      "Pass a single URL OR an array for concurrent batch fetch (default 4 in flight). " +
      "Use this when you need page bodies; use wsc_verify when you only need proof (sha256 + fetched_at).",
    inputSchema: {
      type: "object",
      properties: {
        urls: {
          type: "array",
          items: { type: "string" },
          description: "One or more URLs to fetch.",
        },
        formats: {
          type: "array",
          items: { type: "string" },
          description: "Firecrawl format list, e.g. ['markdown', 'html'].",
        },
        screenshot: { type: "boolean" },
        concurrency: { type: "number", description: "Max in-flight fetches in batch mode (default 4)." },
        no_cache: { type: "boolean" },
      },
      required: ["urls"],
    },
  },
  {
    name: "wsc_verify",
    description:
      "Verify URLs by fetching each and emitting sha256 + fetched_at proof. " +
      "Use BEFORE citing any URL in a writeup — search/discover results are snippets, NOT verified content. " +
      "Pass urls directly OR set from_receipt to verify the selected_urls of a prior search/discover/fetch receipt.",
    inputSchema: {
      type: "object",
      properties: {
        urls: { type: "array", items: { type: "string" } },
        from_receipt: { type: "string", description: "call_id of a prior receipt; verifies its selected_urls." },
        concurrency: { type: "number" },
        no_cache: { type: "boolean" },
      },
    },
  },
  {
    name: "wsc_deepdive",
    description:
      "Comprehensive briefing macro: search → corroborate → fetch top-K → markdown bundle with inline <evidence url='...' sha256='...' fetched_at='...' /> tags. " +
      "Use this when the user wants 'tell me everything about X' in one round trip. The output markdown is paste-ready into a writeup. " +
      "Three depth presets: shallow (3 sources, no corroborate), standard (5 + corroborate=2; default), deep (5 + corroborate=3).",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        depth: {
          type: "string",
          enum: ["shallow", "standard", "deep"],
          description: "Default 'standard'.",
        },
        time_range: { type: "string", enum: ["day", "week", "month", "year"] },
        include_domains: { type: "array", items: { type: "string" } },
        source: { type: "string", description: "Preset shortcut (hn|reddit|x|gh|so|arxiv; combine with +)." },
        no_cache: { type: "boolean" },
      },
      required: ["query"],
    },
  },
  {
    name: "wsc_docs",
    description:
      "Fetch official library/framework docs via Context7 (Firecrawl GitHub README fallback). Use for 'how do I use react useState' / 'fastapi dependency injection' style questions about a known library.",
    inputSchema: {
      type: "object",
      properties: {
        library: { type: "string", description: "Library name, e.g. 'react', 'next.js', 'tailwindcss'." },
        topic: { type: "string", description: "Optional sub-topic, e.g. 'hooks', 'app router middleware'." },
        version: { type: "string", description: "Optional version pin." },
        no_cache: { type: "boolean" },
      },
      required: ["library"],
    },
  },
  {
    name: "wsc_receipts_tail",
    description:
      "Read recent audit receipts. Every wsc call writes one JSON receipt with call_id, provider, fallback_chain, multi_source_evidence, verified_urls, cache_hit, etc. Use to diagnose a recent call or to grab a call_id for wsc_verify --from_receipt.",
    inputSchema: {
      type: "object",
      properties: {
        lines: { type: "number", description: "Default 20." },
        op: { type: "string", description: "Filter by op prefix (search|discover|fetch|verify|deepdive|...)." },
        provider: { type: "string", description: "Filter by provider name." },
        since: { type: "string", description: "Duration suffix s/m/h/d, e.g. '15m', '2h', '7d'." },
      },
    },
  },
  {
    name: "wsc_cache_stats",
    description:
      "Inspect the content-addressed response cache (size, count, expired entries, breakdown by op/provider). The cache is on by default; repeat queries within the per-op TTL are free.",
    inputSchema: { type: "object", properties: {} },
  },
];

// --- Handlers -------------------------------------------------------------

function asTextResult(payload: unknown, isError = false): { content: Array<{ type: "text"; text: string }>; isError?: boolean } {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}
function asBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}
function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : undefined;
}

async function callTool(name: string, args: Record<string, unknown>): Promise<ReturnType<typeof asTextResult>> {
  switch (name) {
    case "wsc_plan": {
      const query = asString(args.query) ?? "";
      if (asBool(args.explain)) return asTextResult(planOp.explain(query));
      return asTextResult(await planOp.run(query));
    }
    case "wsc_search": {
      const query = asString(args.query) ?? "";
      const includeDomains = resolveIncludeDomains(asString(args.source), asStringArray(args.include_domains));
      return asTextResult(
        await searchOp.run(query, {
          maxResults: asNumber(args.max_results),
          timeRange: asString(args.time_range) as "day" | "week" | "month" | "year" | undefined,
          country: asString(args.country),
          corroborate: asNumber(args.corroborate),
          includeDomains,
          noCache: asBool(args.no_cache),
        }),
      );
    }
    case "wsc_discover": {
      const query = asString(args.query) ?? "";
      const includeDomains = resolveIncludeDomains(asString(args.source), asStringArray(args.include_domains));
      return asTextResult(
        await discoverOp.run(query, {
          type: asString(args.type) as "code" | "paper" | "company" | "people" | undefined,
          sinceDays: asNumber(args.since_days),
          numResults: asNumber(args.num_results),
          corroborate: asNumber(args.corroborate),
          includeDomains,
          noCache: asBool(args.no_cache),
        }),
      );
    }
    case "wsc_fetch": {
      const urls = asStringArray(args.urls) ?? [];
      if (urls.length === 0) return asTextResult({ ok: false, error: "wsc_fetch: 'urls' must be a non-empty string array" }, true);
      const formats = asStringArray(args.formats);
      const screenshot = asBool(args.screenshot);
      const noCache = asBool(args.no_cache);
      if (urls.length === 1) {
        return asTextResult(await fetchOp.run(urls[0]!, { formats, screenshot, noCache }));
      }
      return asTextResult(
        await fetchOp.runMany(urls, { formats, screenshot, noCache, concurrency: asNumber(args.concurrency) }),
      );
    }
    case "wsc_verify": {
      const urls = asStringArray(args.urls) ?? [];
      return asTextResult(
        await verifyOp.run(urls, {
          fromReceipt: asString(args.from_receipt),
          concurrency: asNumber(args.concurrency),
          noCache: asBool(args.no_cache),
        }),
      );
    }
    case "wsc_deepdive": {
      const query = asString(args.query) ?? "";
      const includeDomains = resolveIncludeDomains(asString(args.source), asStringArray(args.include_domains));
      return asTextResult(
        await deepdiveOp.run(query, {
          depth: asString(args.depth) as "shallow" | "standard" | "deep" | undefined,
          timeRange: asString(args.time_range) as "day" | "week" | "month" | "year" | undefined,
          includeDomains,
          noCache: asBool(args.no_cache),
        }),
      );
    }
    case "wsc_docs": {
      const library = asString(args.library) ?? "";
      return asTextResult(
        await docsOp.run(library, {
          topic: asString(args.topic),
          version: asString(args.version),
          noCache: asBool(args.no_cache),
        }),
      );
    }
    case "wsc_receipts_tail": {
      return asTextResult(
        await auditTail({
          lines: asNumber(args.lines),
          op: asString(args.op),
          provider: asString(args.provider),
          since: asString(args.since),
        }),
      );
    }
    case "wsc_cache_stats": {
      return asTextResult(cacheMod.stats());
    }
    default:
      return asTextResult({ ok: false, error: `unknown tool: ${name}` }, true);
  }
}

// --- Server entry point ---------------------------------------------------

export async function runMcpServer(version: string): Promise<void> {
  const server = new Server(
    { name: "wsc", version },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;
    try {
      return await callTool(name, args);
    } catch (err) {
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      return asTextResult({ ok: false, tool: name, error: msg }, true);
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export { TOOLS };
