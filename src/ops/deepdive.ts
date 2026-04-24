/**
 * wsc deepdive — comprehensive briefing macro: search + fetch + format.
 *
 * Replaces the manual "search → pick top K → fetch each → stitch markdown"
 * dance. Output is a single markdown bundle with `<evidence url="..."
 * sha256="..." fetched_at="..." />` tags ready to paste into a writeup.
 *
 * Three depth presets:
 *   shallow   — top 3 search hits, no corroborate, fetch each
 *   standard  — top 5 search with corroborate=2, fetch each
 *   deep      — top 5 search with corroborate=3, fetch each
 *
 * Underlying search/fetch calls all hit the cache, so re-running deepdive on
 * the same query within the cache window is fast and free.
 */

import { createHash, randomUUID } from "node:crypto";
import { record, utcIso, withCall, queryFingerprint } from "../audit.js";
import * as searchOp from "./search.js";
import * as fetchOp from "./fetch.js";

export type Depth = "shallow" | "standard" | "deep";

interface Preset {
  topK: number;
  corroborate: number;
  excerpt_chars: number;
}

const DEPTH_PRESETS: Record<Depth, Preset> = {
  shallow: { topK: 3, corroborate: 0, excerpt_chars: 1000 },
  standard: { topK: 5, corroborate: 2, excerpt_chars: 1500 },
  deep: { topK: 5, corroborate: 3, excerpt_chars: 2500 },
};

export interface DeepdiveOptions {
  depth?: Depth;
  /** Restrict search to specific domains. */
  includeDomains?: string[];
  /** Restrict search to recent results. */
  timeRange?: "day" | "week" | "month" | "year";
  correlationId?: string;
  noReceipt?: boolean;
  noCache?: boolean;
}

export async function run(query: string, opts: DeepdiveOptions = {}): Promise<Record<string, unknown>> {
  const depth: Depth = opts.depth ?? "standard";
  const preset = DEPTH_PRESETS[depth];
  const correlationId = opts.correlationId ?? randomUUID();

  return await withCall(
    "deepdive",
    {
      provider: null,
      correlationId,
      noReceipt: opts.noReceipt,
    },
    async (receipt) => {
      Object.assign(receipt, queryFingerprint(query));
      receipt.params = {
        depth,
        topK: preset.topK,
        corroborate: preset.corroborate,
        include_domains: opts.includeDomains ?? null,
        time_range: opts.timeRange ?? null,
      };

      // Step 1: search (with corroborate if depth ≥ standard).
      const searchPayload = await searchOp.run(query, {
        maxResults: preset.topK,
        timeRange: opts.timeRange,
        includeDomains: opts.includeDomains,
        corroborate: preset.corroborate || undefined,
        correlationId,
        noCache: opts.noCache,
      });

      if (!searchPayload.ok) {
        receipt.status = "error";
        return {
          ok: false,
          operation: "deepdive",
          query,
          depth,
          error: `deepdive: search step failed: ${searchPayload.error ?? "unknown"}`,
          search: searchPayload,
          returncode: 2,
        };
      }

      const results = (searchPayload.results as Array<Record<string, unknown>> | undefined) ?? [];
      if (results.length === 0) {
        receipt.status = "degraded";
        return {
          ok: true,
          operation: "deepdive",
          query,
          depth,
          markdown: emptyMarkdown(query, depth),
          evidence: [],
          search: { provider: searchPayload.provider, status: searchPayload.status },
          returncode: 0,
        };
      }

      const topResults = results.slice(0, preset.topK);
      const topUrls = topResults.map((r) => String(r.url ?? ""));

      // Step 2: fetch each top URL in parallel via fetchOp.run (concurrent
      // through Promise.all; each call hits the fetch cache).
      const fetched = await Promise.all(
        topUrls.map(async (url) => {
          try {
            const f = await fetchOp.run(url, { correlationId, noCache: opts.noCache });
            return { url, payload: f };
          } catch (err) {
            return { url, payload: null, error: err instanceof Error ? err.message : String(err) };
          }
        }),
      );

      // Step 3: build evidence blocks.
      const fetchedAt = new Date().toISOString();
      const evidence: Array<{
        url: string;
        sha256: string | null;
        fetched_at: string;
        status: string;
        provider: string | null;
        title: string;
        snippet: string;
        excerpt: string;
        corroborated_by: string[];
      }> = [];

      for (let i = 0; i < topResults.length; i++) {
        const r = topResults[i]!;
        const fetchEntry = fetched[i]!;
        const payload = fetchEntry.payload as Record<string, unknown> | null;
        if (!payload || !payload.ok) {
          evidence.push({
            url: String(r.url ?? ""),
            sha256: null,
            fetched_at: fetchedAt,
            status: "error",
            provider: null,
            title: String(r.title ?? ""),
            snippet: String(r.snippet ?? ""),
            excerpt: "",
            corroborated_by: ((r.corroborated_by as string[] | undefined) ?? []),
          });
          continue;
        }
        const page = (payload.page as Record<string, unknown> | undefined) ?? {};
        const md = String(page.markdown ?? "");
        const sha = md ? createHash("sha256").update(md, "utf8").digest("hex") : null;
        evidence.push({
          url: String(page.url ?? r.url ?? ""),
          sha256: sha,
          fetched_at: fetchedAt,
          status: String(payload.status ?? "ok"),
          provider: String(payload.provider ?? "unknown"),
          title: String(page.title ?? r.title ?? ""),
          snippet: String(r.snippet ?? ""),
          excerpt: md.slice(0, preset.excerpt_chars),
          corroborated_by: ((r.corroborated_by as string[] | undefined) ?? []),
        });
      }

      const okCount = evidence.filter((e) => e.status === "ok").length;
      const degradedCount = evidence.filter((e) => e.status === "degraded").length;
      const errorCount = evidence.filter((e) => e.status === "error").length;
      const overallStatus: "ok" | "degraded" | "error" =
        errorCount === evidence.length ? "error" : degradedCount + errorCount > 0 ? "degraded" : "ok";

      const markdown = stitchMarkdown({
        query,
        depth,
        evidence,
        searchProvider: String(searchPayload.provider ?? "?"),
        multiSourceEvidence: (searchPayload.multi_source_evidence as Array<{ provider: string }> | undefined) ?? [],
        fetchedAt,
      });

      receipt.results_count = evidence.length;
      receipt.selected_count = okCount;
      receipt.selected_urls = evidence.map((e) => e.url);
      receipt.verified_urls = evidence
        .filter((e) => e.sha256)
        .map((e) => ({
          url: e.url,
          sha256: e.sha256!,
          fetched_at: e.fetched_at,
          status: e.status as "ok" | "degraded" | "error",
        }));
      if (overallStatus !== "ok") receipt.status = overallStatus;

      return {
        ok: errorCount < evidence.length,
        operation: "deepdive",
        query,
        depth,
        markdown,
        evidence,
        counts: { ok: okCount, degraded: degradedCount, error: errorCount, total: evidence.length },
        search: {
          provider: searchPayload.provider,
          status: searchPayload.status,
          multi_source_evidence: searchPayload.multi_source_evidence,
        },
        status: overallStatus,
        correlation_id: correlationId,
        returncode: errorCount === evidence.length ? 2 : 0,
      };
    },
  );
}

function emptyMarkdown(query: string, depth: Depth): string {
  return `# Deepdive: ${escapeMd(query)}\n\n**Depth:** ${depth} | **Result:** no search hits\n\nNothing returned. Try a broader query or remove --time/--source restrictions.\n`;
}

function stitchMarkdown(args: {
  query: string;
  depth: Depth;
  evidence: Array<{
    url: string;
    sha256: string | null;
    fetched_at: string;
    status: string;
    provider: string | null;
    title: string;
    snippet: string;
    excerpt: string;
    corroborated_by: string[];
  }>;
  searchProvider: string;
  multiSourceEvidence: Array<{ provider: string }>;
  fetchedAt: string;
}): string {
  const out: string[] = [];
  out.push(`# Deepdive: ${escapeMd(args.query)}`);
  out.push("");
  const validProviders = args.multiSourceEvidence.length;
  const sourcesLine =
    validProviders >= 2
      ? `corroborated across ${validProviders} providers (${args.multiSourceEvidence.map((e) => e.provider).join(", ")})`
      : `single-provider (${args.searchProvider})`;
  out.push(
    `**Depth:** ${args.depth} | **Generated:** ${args.fetchedAt} | **Search:** ${sourcesLine}`,
  );
  out.push("");
  out.push(`Below are ${args.evidence.length} sources, each with a sha256 proof from the fetched markdown body.`);
  out.push("");

  for (let i = 0; i < args.evidence.length; i++) {
    const e = args.evidence[i]!;
    out.push("---");
    out.push("");
    const corro =
      e.corroborated_by.length > 0 ? ` corroborated_by="${e.corroborated_by.join(",")}"` : "";
    out.push(
      `<evidence url="${e.url}" sha256="${e.sha256 ?? "fetch_failed"}" fetched_at="${e.fetched_at}" status="${e.status}" provider="${e.provider ?? "?"}"${corro} />`,
    );
    out.push("");
    out.push(`## ${i + 1}. ${escapeMd(e.title || e.url)}`);
    out.push("");
    if (e.snippet) {
      out.push(`> ${e.snippet.replace(/\n/g, " ").trim()}`);
      out.push("");
    }
    if (e.status === "error") {
      out.push("_(fetch failed — citation not safe)_");
    } else {
      out.push(e.excerpt.trim() || "_(empty body)_");
    }
    out.push("");
  }

  out.push("---");
  out.push("");
  out.push("## Provenance");
  out.push("");
  out.push(`- depth: \`${args.depth}\``);
  out.push(`- search providers: ${args.multiSourceEvidence.map((e) => `\`${e.provider}\``).join(", ") || `\`${args.searchProvider}\``}`);
  out.push(`- evidence count: ${args.evidence.length}`);
  out.push(`- fetched_at: ${args.fetchedAt}`);
  out.push("");
  return out.join("\n");
}

function escapeMd(s: string): string {
  return s.replace(/[\\<>]/g, (c) => `\\${c}`);
}
