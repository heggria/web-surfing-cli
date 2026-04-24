"""wsc search — general web facts via Tavily, falling back to Brave / DDG."""

from __future__ import annotations

from typing import Any, Dict, Optional

from wsc import audit
from wsc.ops._chain import chain_failed_payload, filtered_chain, query_fingerprint, run_chain


_TIME_TO_TAVILY_DAYS = {"day": 1, "week": 7, "month": 30, "year": 365}
_TIME_TO_BRAVE_FRESHNESS = {"day": "pd", "week": "pw", "month": "pm", "year": "py"}


def run(
    query: str,
    *,
    max_results: int = 10,
    time_range: Optional[str] = None,  # "day"|"week"|"month"|"year"
    country: Optional[str] = None,
    correlation_id: Optional[str] = None,
    no_receipt: bool = False,
) -> Dict[str, Any]:
    chain = filtered_chain("web_facts")

    def tavily_action(provider):
        return provider.search(
            query,
            max_results=max_results,
            search_depth="basic",
            topic="news" if time_range else None,
            days=_TIME_TO_TAVILY_DAYS.get(time_range) if time_range else None,
            country=country,
        )

    def brave_action(provider):
        return provider.search(
            query,
            count=max_results,
            country=country,
            freshness=_TIME_TO_BRAVE_FRESHNESS.get(time_range) if time_range else None,
        )

    def ddg_action(provider):
        return provider.search(query, count=max_results)

    actions = {"tavily": tavily_action, "brave": brave_action, "duckduckgo": ddg_action}

    with audit.start_call(
        "search", provider=chain[0] if chain else None,
        correlation_id=correlation_id, no_receipt=no_receipt,
    ) as receipt:
        receipt.update(query_fingerprint(query))
        receipt["params"] = {"max_results": max_results, "time_range": time_range, "country": country}
        active, results, fallback = run_chain(chain, actions)
        receipt["fallback_chain"] = fallback
        if active is None:
            receipt["status"] = "error"
            return chain_failed_payload("search", fallback)
        receipt["provider"] = active
        urls = [r.url for r in results]
        receipt["selected_urls"] = urls
        receipt["results_count"] = len(results)
        receipt["selected_count"] = len(results)
        if active != chain[0]:
            receipt["status"] = "degraded"
        return {
            "ok": True,
            "operation": "search",
            "provider": active,
            "query": query,
            "results": [r.to_dict() for r in results],
            "fallback_chain": fallback,
            "status": "degraded" if active != chain[0] else "ok",
            "returncode": 0,
        }
