"""Tavily — agent-friendly web search (https://docs.tavily.com/).

Endpoint: ``POST https://api.tavily.com/search``.
Auth: API key in body (``api_key`` field). The newer header form
(``Authorization: Bearer ...``) is also accepted; v0.1 uses the body form
for maximum compatibility with older accounts.
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

ENDPOINT = "https://api.tavily.com/search"


class TavilyProvider(Provider):
    name = "tavily"
    schema_version = "tavily-v1-2026-04"

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
        max_results: int = 10,
        search_depth: str = "basic",  # "basic" | "advanced"
        topic: Optional[str] = None,  # "general" | "news"
        days: Optional[int] = None,   # only used when topic == "news"
        include_domains: Optional[List[str]] = None,
        exclude_domains: Optional[List[str]] = None,
        country: Optional[str] = None,
        timeout: float = 30.0,
    ) -> List[NormalizedResult]:
        body: Dict[str, Any] = {
            "api_key": self._ensure_key(),
            "query": query,
            "max_results": int(max_results),
            "search_depth": search_depth,
        }
        if topic:
            body["topic"] = topic
        if days is not None:
            body["days"] = int(days)
        if include_domains:
            body["include_domains"] = include_domains
        if exclude_domains:
            body["exclude_domains"] = exclude_domains
        if country:
            body["country"] = country

        response = http_request(ENDPOINT, method="POST", body=body, timeout=timeout)
        return self.normalize(response.get("json") or {})

    def normalize(self, payload: Dict[str, Any]) -> List[NormalizedResult]:
        results = safe_get(payload, "results", default=[]) or []
        out: List[NormalizedResult] = []
        for r in results:
            url = safe_get(r, "url", default="")
            if not url:
                continue
            out.append(
                NormalizedResult(
                    url=url,
                    title=safe_get(r, "title", default="") or "",
                    snippet=safe_get(r, "content", default="") or "",
                    score=_to_float(safe_get(r, "score")),
                    published_at=safe_get(r, "published_date"),
                    source_kind="web",
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
