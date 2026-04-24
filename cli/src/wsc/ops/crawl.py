"""wsc crawl — Firecrawl crawl with per-call and per-day budget gates.

Apply ladder (locked in by the plan):

* ≤10 pages   → no ``--apply`` required.
* 11–100      → require ``--apply``.
* >100        → require ``--apply --i-know-this-burns-credits``.

There is **no fallback** for crawl — Firecrawl owns this lane. If Firecrawl
is missing/disabled, fail loud.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from wsc import audit
from wsc.ops._chain import filtered_chain, query_fingerprint
from wsc.providers import (
    DisabledError,
    MissingKeyError,
    ProviderError,
    get_provider,
)


def gate_pages(max_pages: int, *, apply: bool, deep_apply: bool) -> Optional[str]:
    if max_pages <= 10:
        return None
    if max_pages <= 100 and not apply:
        return f"crawl of {max_pages} pages requires --apply (range 11–100)"
    if max_pages > 100 and not (apply and deep_apply):
        return (
            f"crawl of {max_pages} pages requires --apply --i-know-this-burns-credits"
        )
    return None


def run(
    url: str,
    *,
    max_pages: int = 10,
    include_paths: Optional[List[str]] = None,
    exclude_paths: Optional[List[str]] = None,
    formats: Optional[List[str]] = None,
    apply: bool = False,
    deep_apply: bool = False,
    correlation_id: Optional[str] = None,
    no_receipt: bool = False,
) -> Dict[str, Any]:
    block_reason = gate_pages(max_pages, apply=apply, deep_apply=deep_apply)
    if block_reason:
        return {
            "ok": False,
            "operation": "crawl",
            "error": block_reason,
            "url": url,
            "max_pages": max_pages,
            "fallback_chain": [],
            "returncode": 2,
        }

    with audit.start_call(
        "crawl", provider="firecrawl",
        correlation_id=correlation_id, no_receipt=no_receipt,
    ) as receipt:
        receipt.update(query_fingerprint(url))
        receipt["params"] = {
            "max_pages": max_pages,
            "include_paths": include_paths,
            "exclude_paths": exclude_paths,
            "formats": formats,
            "apply": apply,
        }
        try:
            provider = get_provider("firecrawl")
        except (MissingKeyError, DisabledError) as exc:
            receipt["status"] = "error"
            receipt["fallback_chain"] = [{"from": "firecrawl", "reason": exc.kind}]
            return {
                "ok": False,
                "operation": "crawl",
                "provider": None,
                "fallback_chain": receipt["fallback_chain"],
                "error": str(exc),
                "returncode": 2,
            }
        try:
            pages = provider.crawl(
                url,
                limit=max_pages,
                include_paths=include_paths,
                exclude_paths=exclude_paths,
                formats=formats,
            )
        except ProviderError as exc:
            receipt["status"] = "error"
            receipt["error"] = str(exc)[:200]
            return {
                "ok": False,
                "operation": "crawl",
                "provider": "firecrawl",
                "error": str(exc),
                "returncode": 1,
            }
        receipt["provider"] = "firecrawl"
        receipt["fallback_chain"] = []
        urls = [p.url for p in pages if p.url]
        receipt["selected_urls"] = urls
        receipt["selected_count"] = len(urls)
        receipt["results_count"] = len(pages)
        return {
            "ok": True,
            "operation": "crawl",
            "provider": "firecrawl",
            "url": url,
            "max_pages": max_pages,
            "pages": [p.to_dict() for p in pages],
            "returncode": 0,
        }
