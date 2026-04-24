"""wsc plan — classify a query and dispatch to the right op.

In v0.1 the dispatcher only handles the unambiguous routing decisions made by
``RuleRouter`` — there's no "auto cross-validation" yet (that's v0.2 once the
content cache and multi-source dedup land). The receipt embeds the full
``RouteDecision`` so downstream consumers (Hermit) can replay the choice.
"""

from __future__ import annotations

import os
import shlex
from typing import Any, Dict, Optional

from wsc import audit, routing
from wsc.ops import crawl, discover, docs, fetch, search


def explain(
    query: str,
    *,
    prefer: Optional[str] = None,
    budget_override: Optional[int] = None,
    router_name: str = "rule",
) -> Dict[str, Any]:
    router = routing.get_router(router_name)
    decision = router.classify(query, context={"prefer": prefer, "budget_override": budget_override})
    return {
        "ok": True,
        "operation": "plan.explain",
        "query": query,
        "decision": decision.to_dict(),
        "would_run": f"wsc {decision.recommended_op} {shlex.quote(query)}",
        "returncode": 0,
    }


def run(
    query: str,
    *,
    prefer: Optional[str] = None,
    budget_override: Optional[int] = None,
    router_name: str = "rule",
    correlation_id: Optional[str] = None,
    no_receipt: bool = False,
) -> Dict[str, Any]:
    router = routing.get_router(router_name)
    decision = router.classify(query, context={"prefer": prefer, "budget_override": budget_override})

    correlation = correlation_id or os.environ.get("WSC_CORRELATION_ID")

    op = decision.recommended_op
    sub_payload: Dict[str, Any]
    if op == "docs":
        sub_payload = docs.run(query, correlation_id=correlation, no_receipt=no_receipt)
    elif op == "discover":
        sub_payload = discover.run(query, correlation_id=correlation, no_receipt=no_receipt)
    elif op == "fetch":
        sub_payload = fetch.run(query, correlation_id=correlation, no_receipt=no_receipt)
    elif op == "crawl":
        sub_payload = crawl.run(query, correlation_id=correlation, no_receipt=no_receipt)
    elif op == "search":
        sub_payload = search.run(query, correlation_id=correlation, no_receipt=no_receipt)
    else:
        sub_payload = {"ok": False, "operation": op, "error": f"unknown op: {op}", "returncode": 2}

    # Wrap with the routing decision and a top-level "plan" receipt so the
    # plan call itself appears in the audit log alongside the dispatched op.
    with audit.start_call("plan", provider=decision.recommended_provider, correlation_id=correlation, no_receipt=no_receipt) as receipt:
        receipt["route_decision"] = decision.to_dict()
        receipt["dispatched_op"] = op
        receipt["sub_status"] = sub_payload.get("status") or ("ok" if sub_payload.get("ok") else "error")

    return {
        "ok": sub_payload.get("ok", False),
        "operation": "plan",
        "query": query,
        "decision": decision.to_dict(),
        "dispatched_op": op,
        "result": sub_payload,
        "returncode": int(sub_payload.get("returncode", 0)),
    }
