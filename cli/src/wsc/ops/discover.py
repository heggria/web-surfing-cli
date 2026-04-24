"""wsc discover — semantic discovery via Exa, falling back to Tavily/Brave/DDG."""

from __future__ import annotations

from typing import Any, Dict, Optional

from wsc import audit
from wsc.ops._chain import chain_failed_payload, filtered_chain, query_fingerprint, run_chain


_TYPE_TO_EXA_CATEGORY = {
    "code": "github",
    "paper": "research paper",
    "company": "company",
    "people": "person",
}


def run(
    query: str,
    *,
    type_: Optional[str] = None,
    since_days: Optional[int] = None,
    num_results: int = 10,
    correlation_id: Optional[str] = None,
    no_receipt: bool = False,
) -> Dict[str, Any]:
    chain = filtered_chain("semantic_discovery")
    category = _TYPE_TO_EXA_CATEGORY.get(type_) if type_ else None
    framed = _reframe_for_keyword_search(query, type_)

    def exa_action(provider):
        return provider.search(
            query,
            num_results=num_results,
            type_="auto",
            category=category,
            start_published_date=_days_ago_iso(since_days) if since_days else None,
        )

    def tavily_action(provider):
        return provider.search(framed, max_results=num_results, search_depth="advanced")

    def brave_action(provider):
        return provider.search(framed, count=num_results)

    def ddg_action(provider):
        return provider.search(framed, count=num_results)

    actions = {
        "exa": exa_action,
        "tavily": tavily_action,
        "brave": brave_action,
        "duckduckgo": ddg_action,
    }

    with audit.start_call(
        "discover", provider=chain[0] if chain else None,
        correlation_id=correlation_id, no_receipt=no_receipt,
    ) as receipt:
        receipt.update(query_fingerprint(query))
        receipt["params"] = {"type": type_, "since_days": since_days, "num_results": num_results}
        active, results, fallback = run_chain(chain, actions)
        receipt["fallback_chain"] = fallback
        if active is None:
            receipt["status"] = "error"
            return chain_failed_payload("discover", fallback)
        receipt["provider"] = active
        urls = [r.url for r in results]
        receipt["selected_urls"] = urls
        receipt["results_count"] = len(results)
        receipt["selected_count"] = len(results)
        if active != chain[0]:
            receipt["status"] = "degraded"
        return {
            "ok": True,
            "operation": "discover",
            "provider": active,
            "query": query,
            "results": [r.to_dict() for r in results],
            "fallback_chain": fallback,
            "status": "degraded" if active != chain[0] else "ok",
            "returncode": 0,
        }


def _days_ago_iso(days: int) -> str:
    from datetime import datetime, timedelta, timezone

    return (datetime.now(timezone.utc) - timedelta(days=int(days))).strftime("%Y-%m-%d")


def _reframe_for_keyword_search(query: str, type_: Optional[str]) -> str:
    """Tavily/Brave/DDG don't share Exa's neural ranking; nudge the query
    toward the kind of result we'd be looking for. Conservative — only adds
    one clause."""

    if not type_:
        return query
    if type_ == "paper":
        return f"research papers about: {query}"
    if type_ == "code":
        return f"github examples of: {query}"
    if type_ == "company":
        return f"company information about: {query}"
    if type_ == "people":
        return f"people associated with: {query}"
    return query
