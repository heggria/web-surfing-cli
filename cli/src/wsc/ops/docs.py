"""wsc docs — official library docs via Context7, falling back to GitHub README via Firecrawl."""

from __future__ import annotations

from typing import Any, Dict, Optional

from wsc import audit
from wsc.ops._chain import chain_failed_payload, filtered_chain, query_fingerprint, run_chain
from wsc.providers import FetchedPage, ProviderError


def run(
    library: str,
    *,
    topic: Optional[str] = None,
    version: Optional[str] = None,
    correlation_id: Optional[str] = None,
    no_receipt: bool = False,
) -> Dict[str, Any]:
    chain = filtered_chain("library_docs")

    def context7_action(provider):
        candidates = provider.resolve_library(library)
        if not candidates:
            raise ProviderError(f"context7: no library found for {library!r}")
        # Take the top candidate; library_id is the path part of the URL.
        top = candidates[0]
        # url is like https://context7.com/api/v1/<library_id>
        library_id = top.url.split("/api/v1", 1)[-1] or "/" + library
        page: FetchedPage = provider.get_docs(library_id, topic=topic)
        return {"library_id": library_id, "page": page, "candidates": candidates}

    def firecrawl_fallback(provider):
        # Best-effort: scrape the GitHub README for ``<library>``. Many libs
        # are at github.com/<library>/<library> (e.g. vercel/next.js); this is
        # a best-guess fallback only used when context7 is unavailable.
        guesses = [
            f"https://raw.githubusercontent.com/{library}/{library}/main/README.md",
            f"https://github.com/{library}/{library}",
        ]
        last_err: Optional[Exception] = None
        for url in guesses:
            try:
                page = provider.scrape(url)
                page.status = "degraded"  # readme is not the real docs
                return {"library_id": library, "page": page, "candidates": []}
            except ProviderError as exc:
                last_err = exc
                continue
        raise last_err or ProviderError("firecrawl: no readme found for fallback")

    actions = {"context7": context7_action, "firecrawl": firecrawl_fallback}

    with audit.start_call(
        "docs", provider=chain[0] if chain else None,
        correlation_id=correlation_id, no_receipt=no_receipt,
    ) as receipt:
        receipt.update(query_fingerprint(library))
        receipt["params"] = {"topic": topic, "version": version}
        active, result, fallback = run_chain(chain, actions)
        receipt["fallback_chain"] = fallback
        if active is None:
            receipt["status"] = "error"
            return chain_failed_payload("docs", fallback)
        receipt["provider"] = active
        page: FetchedPage = result["page"]
        receipt["selected_urls"] = [page.url] if page.url else []
        receipt["selected_count"] = 1
        receipt["results_count"] = 1
        if page.status == "degraded":
            receipt["status"] = "degraded"
        return {
            "ok": True,
            "operation": "docs",
            "provider": active,
            "library": library,
            "library_id": result["library_id"],
            "topic": topic,
            "page": page.to_dict(),
            "fallback_chain": fallback,
            "status": page.status,
            "returncode": 0,
        }
