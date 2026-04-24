/**
 * wsc verify — fetch URLs and emit proof-shaped receipts (sha256 + fetched_at).
 *
 * Use `wsc verify URL1 URL2 ...` before citing those URLs in a writeup, OR
 * pass `--from-receipt <call_id>` to verify every URL from a prior search /
 * discover receipt.
 *
 * Internally a thin wrapper over fetch.runMany — we get the same fetch chain,
 * the same cache, and a parent receipt with op="verify" instead of "batch_fetch".
 */

import { tail } from "../audit.js";
import { runMany } from "./fetch.js";

export interface VerifyOptions {
  /** If set, ignore positional URLs and verify the selected_urls of this prior receipt. */
  fromReceipt?: string;
  concurrency?: number;
  noReceipt?: boolean;
  noCache?: boolean;
  correlationId?: string;
}

export async function run(urls: string[], opts: VerifyOptions = {}): Promise<Record<string, unknown>> {
  let targetUrls = urls;
  if (opts.fromReceipt) {
    const events = (await tail({ lines: 1000 })).events;
    const ev = events.find((e) => e.call_id === opts.fromReceipt);
    if (!ev) {
      return {
        ok: false,
        operation: "verify",
        error: `no audit event with call_id=${opts.fromReceipt} (within last 1000 receipts)`,
        returncode: 2,
      };
    }
    const fromUrls = (ev.selected_urls as string[] | undefined) ?? [];
    if (fromUrls.length === 0) {
      return {
        ok: false,
        operation: "verify",
        error: `receipt ${opts.fromReceipt} has no selected_urls to verify`,
        returncode: 2,
      };
    }
    targetUrls = fromUrls;
  }

  if (targetUrls.length === 0) {
    return { ok: false, operation: "verify", error: "no URLs to verify (pass URLs or --from-receipt)", returncode: 2 };
  }

  const result = await runMany(targetUrls, {
    op: "verify",
    concurrency: opts.concurrency,
    correlationId: opts.correlationId,
    noReceipt: opts.noReceipt,
    noCache: opts.noCache,
  });

  // Re-key the entries so the wire output uses sha256/fetched_at/title/head_snippet
  // (the proof-flavored shape) rather than batch_fetch's bytes/duration shape.
  const entries = (result.urls as Array<Record<string, unknown>> | undefined) ?? [];
  const verified = entries.map((e) => ({
    url: e.url,
    sha256: e.sha256 ?? null,
    fetched_at: new Date().toISOString(),
    status: e.status ?? "error",
    provider: e.provider ?? null,
    title: e.title ?? null,
    bytes: e.bytes ?? null,
    duration_ms: e.duration_ms ?? null,
    error: e.error ?? null,
  }));

  return {
    ok: result.ok,
    operation: "verify",
    parent_call_id: result.parent_call_id,
    urls: verified,
    counts: result.counts,
    duration_ms: result.duration_ms,
    status: result.status,
    returncode: result.returncode,
    ...(opts.fromReceipt ? { from_receipt: opts.fromReceipt } : {}),
  };
}
