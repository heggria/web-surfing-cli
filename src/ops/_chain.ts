/** Shared op helpers — chain runner, fingerprinting, error → fallback step. */

import { ROLE_FALLBACK_CHAIN, type ProviderRole } from "../config.js";
import {
  AuthError,
  DisabledError,
  MissingKeyError,
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
