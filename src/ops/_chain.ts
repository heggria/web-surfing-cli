/** Shared op helpers — chain runner, fingerprinting, error → fallback step. */

import { ROLE_FALLBACK_CHAIN, type ProviderRole } from "../config.js";
import {
  AuthError,
  DisabledError,
  MissingKeyError,
  NormalizedResult,
  Provider,
  ProviderError,
  RateLimitError,
  TransportError,
  getProvider,
} from "../providers/index.js";

export interface FallbackStep {
  from: string;
  to?: string;
  reason: string;
  error?: string;
}

export type Action<R> = (provider: Provider) => R | Promise<R>;

export interface ChainResult<R> {
  active: string | null;
  result: R | null;
  fallback: FallbackStep[];
}

export function filteredChain(role: ProviderRole): string[] {
  return [...(ROLE_FALLBACK_CHAIN[role] ?? [])];
}

export async function runChain<R>(
  chain: string[],
  actions: Record<string, Action<R>>,
): Promise<ChainResult<R>> {
  const fallback: FallbackStep[] = [];
  for (const name of chain) {
    const action = actions[name];
    if (!action) continue;
    let provider: Provider;
    try {
      provider = getProvider(name);
    } catch (err) {
      if (err instanceof MissingKeyError || err instanceof DisabledError) {
        fallback.push({ from: name, reason: err.kind });
        continue;
      }
      throw err;
    }
    try {
      const result = await action(provider);
      return { active: name, result, fallback };
    } catch (err) {
      if (
        err instanceof RateLimitError ||
        err instanceof TransportError ||
        err instanceof AuthError ||
        err instanceof ProviderError
      ) {
        fallback.push({
          from: name,
          reason: err.kind,
          error: String(err.message ?? err).slice(0, 200),
        });
        continue;
      }
      throw err;
    }
  }
  return { active: null, result: null, fallback };
}

// --- Parallel fan-out (M1 of v0.3) ---------------------------------------

/**
 * Result of a parallel fan-out across multiple providers, with per-URL
 * cross-validation. The shape is intentionally NormalizedResult-specific:
 * dedup + corroboration only make sense for search/discover results.
 */
export interface ParallelChainResult {
  /** Merged + deduped results, ordered by corroboration count then by score. */
  result: NormalizedResult[];
  /** First successful provider — used as the "primary" in the receipt. */
  active: string | null;
  /** Providers that successfully returned results. */
  participants: Array<{ provider: string; result_count: number; best_score: number | null }>;
  /** Providers that errored or were skipped (missing_key/disabled/rate_limit/etc). */
  failures: FallbackStep[];
  /** URLs received but not included in the canonical result (dedup loss / empty URL / etc). */
  rejected: Array<{ url: string; reason: string }>;
}

/**
 * Fan out to up to `count` providers from the chain in parallel.
 * Skips MissingKey/Disabled providers without spending their slot.
 *
 * Returns a single merged result list with `corroboratedBy` populated on each
 * NormalizedResult — the more providers returned the same URL, the higher
 * confidence we have in it.
 */
export async function runChainParallel(
  chain: string[],
  actions: Record<string, Action<NormalizedResult[]>>,
  opts: { count: number },
): Promise<ParallelChainResult> {
  const failures: FallbackStep[] = [];

  // Step 1: pick the first `count` providers from the chain that are both
  // wired (have an action) and instantiable (not missing_key / disabled).
  const candidates: Array<{ name: string; provider: Provider }> = [];
  for (const name of chain) {
    if (candidates.length >= opts.count) break;
    if (!actions[name]) continue;
    try {
      const provider = getProvider(name);
      candidates.push({ name, provider });
    } catch (err) {
      if (err instanceof MissingKeyError || err instanceof DisabledError) {
        failures.push({ from: name, reason: err.kind });
        continue;
      }
      throw err;
    }
  }

  if (candidates.length === 0) {
    return { result: [], active: null, participants: [], failures, rejected: [] };
  }

  // Step 2: run all candidates in parallel.
  const settled = await Promise.allSettled(
    candidates.map(async ({ name, provider }) => ({
      provider: name,
      results: await actions[name]!(provider),
    })),
  );

  // Step 3: collect successful per-provider results, log failures.
  const perProvider: Array<{ provider: string; results: NormalizedResult[] }> = [];
  for (let i = 0; i < settled.length; i++) {
    const s = settled[i]!;
    const cand = candidates[i]!;
    if (s.status === "fulfilled") {
      perProvider.push({ provider: s.value.provider, results: s.value.results ?? [] });
    } else {
      const err = s.reason;
      if (
        err instanceof RateLimitError ||
        err instanceof TransportError ||
        err instanceof AuthError ||
        err instanceof ProviderError
      ) {
        failures.push({
          from: cand.name,
          reason: err.kind,
          error: String(err.message ?? err).slice(0, 200),
        });
      } else {
        // Unknown error type — surface as transport_error so the receipt is
        // still well-formed, but stash the message.
        failures.push({
          from: cand.name,
          reason: "transport_error",
          error: err instanceof Error ? `${err.name}: ${err.message}`.slice(0, 200) : String(err).slice(0, 200),
        });
      }
    }
  }

  if (perProvider.length === 0) {
    return { result: [], active: null, participants: [], failures, rejected: [] };
  }

  // Step 4: merge + dedupe by urlNormalized, attach corroboratedBy. Track
  // dedup losses in `rejected` so receipts can show overlap density.
  const seen = new Map<string, NormalizedResult>();
  const rejected: Array<{ url: string; reason: string }> = [];
  for (const { provider, results } of perProvider) {
    for (const r of results) {
      const key = r.urlNormalized || r.url;
      if (!key) {
        rejected.push({ url: r.url || "(empty)", reason: "empty_url" });
        continue;
      }
      const existing = seen.get(key);
      if (!existing) {
        // First sighting: this provider is the canonical.
        // Make a defensive copy with empty corroboratedBy so we don't mutate
        // the provider's own result instance (which may be cached upstream).
        const cloned = new NormalizedResult({
          url: r.url,
          title: r.title,
          snippet: r.snippet,
          score: r.score,
          publishedAt: r.publishedAt,
          sourceKind: r.sourceKind,
          provider: r.provider,
          raw: r.raw,
          corroboratedBy: [],
        });
        seen.set(key, cloned);
      } else if (provider !== existing.provider && !existing.corroboratedBy.includes(provider)) {
        existing.corroboratedBy.push(provider);
        rejected.push({ url: r.url, reason: `merged_into_${existing.provider}` });
      }
    }
  }

  // Step 5: sort by corroboration count desc, then by score desc.
  const merged = [...seen.values()].sort((a, b) => {
    const ca = a.corroboratedBy.length;
    const cb = b.corroboratedBy.length;
    if (cb !== ca) return cb - ca;
    return (b.score ?? 0) - (a.score ?? 0);
  });

  // Step 6: build participants list.
  const participants = perProvider.map(({ provider, results }) => ({
    provider,
    result_count: results.length,
    best_score: results.reduce<number | null>((best, r) => {
      if (r.score == null) return best;
      if (best == null || r.score > best) return r.score;
      return best;
    }, null),
  }));

  return {
    result: merged,
    active: perProvider[0]!.provider,
    participants,
    failures,
    rejected,
  };
}

export async function chainFailedPayload(
  opName: string,
  fallback: FallbackStep[],
): Promise<{ ok: false; operation: string; provider: null; fallback_chain: FallbackStep[]; error: string; returncode: 2 }> {
  return {
    ok: false,
    operation: opName,
    provider: null,
    fallback_chain: fallback,
    error: `${opName}: all providers failed (chain=${JSON.stringify(fallback.map((f) => f.from))})`,
    returncode: 2,
  };
}

export { queryFingerprint } from "../audit.js";
