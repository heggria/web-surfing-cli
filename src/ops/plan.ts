/** wsc plan — classify and dispatch to the right op. */

import { withCall } from "../audit.js";
import { getRouter, type RouteDecision } from "../routing.js";
import * as crawl from "./crawl.js";
import * as discover from "./discover.js";
import * as docs from "./docs.js";
import * as fetchOp from "./fetch.js";
import * as search from "./search.js";

export interface PlanOptions {
  prefer?: "fast" | "deep";
  budgetOverride?: number | null;
  routerName?: "rule" | "llm";
  correlationId?: string;
  noReceipt?: boolean;
}

function shellQuote(s: string): string {
  if (/^[\w\.\/:%@\-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

export function explain(query: string, opts: PlanOptions = {}): Record<string, unknown> {
  const router = getRouter(opts.routerName ?? "rule");
  const decision = router.classify(query, { prefer: opts.prefer, budgetOverride: opts.budgetOverride });
  return {
    ok: true,
    operation: "plan.explain",
    query,
    decision,
    would_run: `wsc ${decision.recommended_op} ${shellQuote(query)}`,
    returncode: 0,
  };
}

export async function run(query: string, opts: PlanOptions = {}): Promise<Record<string, unknown>> {
  const router = getRouter(opts.routerName ?? "rule");
  const decision: RouteDecision = router.classify(query, {
    prefer: opts.prefer,
    budgetOverride: opts.budgetOverride,
  });
  const correlationId = opts.correlationId ?? process.env.WSC_CORRELATION_ID;

  let subPayload: Record<string, unknown>;
  switch (decision.recommended_op) {
    case "docs":
      subPayload = (await docs.run(query, { correlationId, noReceipt: opts.noReceipt })) as unknown as Record<
        string,
        unknown
      >;
      break;
    case "discover":
      subPayload = await discover.run(query, { correlationId, noReceipt: opts.noReceipt });
      break;
    case "fetch":
      subPayload = await fetchOp.run(query, { correlationId, noReceipt: opts.noReceipt });
      break;
    case "crawl":
      subPayload = await crawl.run(query, { correlationId, noReceipt: opts.noReceipt });
      break;
    case "search":
      subPayload = await search.run(query, { correlationId, noReceipt: opts.noReceipt });
      break;
    default:
      subPayload = {
        ok: false,
        operation: decision.recommended_op,
        error: `unknown op: ${decision.recommended_op}`,
        returncode: 2,
      };
  }

  await withCall(
    "plan",
    { provider: decision.recommended_provider, correlationId, noReceipt: opts.noReceipt },
    async (receipt) => {
      receipt.route_decision = decision;
      receipt.dispatched_op = decision.recommended_op;
      receipt.sub_status = (subPayload.status as string) ?? (subPayload.ok ? "ok" : "error");
    },
  );

  return {
    ok: !!subPayload.ok,
    operation: "plan",
    query,
    decision,
    dispatched_op: decision.recommended_op,
    result: subPayload,
    returncode: Number(subPayload.returncode ?? 0),
  };
}
