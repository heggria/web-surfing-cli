"""Exa — semantic web search (https://docs.exa.ai/reference/search).

Endpoint: ``POST https://api.exa.ai/search``. Auth header: ``x-api-key``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from wsc.providers.base import (
    NormalizedResult,
    Provider,
    http_request,
    MissingKeyError,
    safe_get,
)

ENDPOINT = "https://api.exa.ai/search"


class ExaProvider(Provider):
    name = "exa"
    schema_version = "exa-v1-2026-04"

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key

    def _ensure_key(self) -> str:
        if not self.api_key:
            raise MissingKeyError(self.name)
        return self.api_key

    def search(
        self,
        query: str,
        *,
        num_results: int = 10,
        type_: Optional[str] = None,    # "neural" | "keyword" | "auto"
        category: Optional[str] = None, # "code" | "research paper" | "company" | "person" | ...
        start_published_date: Optional[str] = None,
        end_published_date: Optional[str] = None,
        include_domains: Optional[List[str]] = None,
        exclude_domains: Optional[List[str]] = None,
        timeout: float = 30.0,
    ) -> List[NormalizedResult]:
        body: Dict[str, Any] = {"query": query, "numResults": int(num_results)}
        if type_:
            body["type"] = type_
        if category:
            body["category"] = category
        if start_published_date:
            body["startPublishedDate"] = start_published_date
        if end_published_date:
            body["endPublishedDate"] = end_published_date
        if include_domains:
            body["includeDomains"] = include_domains
        if exclude_domains:
            body["excludeDomains"] = exclude_domains

        response = http_request(
            ENDPOINT,
            method="POST",
            headers={"x-api-key": self._ensure_key()},
            body=body,
            timeout=timeout,
        )
        return self.normalize(response.get("json") or {}, category=category)

    def normalize(self, payload: Dict[str, Any], *, category: Optional[str] = None) -> List[NormalizedResult]:
        results = safe_get(payload, "results", default=[]) or []
        kind = _category_to_kind(category)
        out: List[NormalizedResult] = []
        for r in results:
            url = safe_get(r, "url", default="")
            if not url:
                continue
            out.append(
                NormalizedResult(
                    url=url,
                    title=safe_get(r, "title", default="") or "",
                    snippet=safe_get(r, "text", default="")
                    or safe_get(r, "summary", default="")
                    or "",
                    score=_to_float(safe_get(r, "score")),
                    published_at=safe_get(r, "publishedDate"),
                    source_kind=kind,
                    provider=self.name,
                    raw=r,
                )
            )
        return out


def _to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _category_to_kind(category: Optional[str]) -> str:
    if not category:
        return "web"
    c = category.lower()
    if "paper" in c:
        return "paper"
    if "code" in c or "github" in c:
        return "code"
    if "compan" in c:
        return "company"
    if "person" in c or "people" in c:
        return "company"  # close enough for v0.1 — treat people as entity-like
    return "web"
