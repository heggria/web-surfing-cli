"""Brave Search — REST web search (https://api.search.brave.com/).

Endpoint: ``GET https://api.search.brave.com/res/v1/web/search``.
Auth: ``X-Subscription-Token: <BRAVE_API_KEY>``.

Reminder (corrected from initial intuition): Brave is a *peer* search
provider, not a zero-key fallback. The free tier requires a key and is
rate-limited.
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

ENDPOINT = "https://api.search.brave.com/res/v1/web/search"


class BraveProvider(Provider):
    name = "brave"
    schema_version = "brave-v1-2026-04"

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
        count: int = 10,
        country: Optional[str] = None,
        freshness: Optional[str] = None,  # "pd" | "pw" | "pm" | "py" (day/week/month/year)
        timeout: float = 30.0,
    ) -> List[NormalizedResult]:
        params = {"q": query, "count": str(int(count))}
        if country:
            params["country"] = country
        if freshness:
            params["freshness"] = freshness
        response = http_request(
            ENDPOINT,
            method="GET",
            headers={
                "x-subscription-token": self._ensure_key(),
                "accept": "application/json",
            },
            params=params,
            timeout=timeout,
        )
        return self.normalize(response.get("json") or {})

    def normalize(self, payload: Dict[str, Any]) -> List[NormalizedResult]:
        results = safe_get(payload, "web", "results", default=[]) or []
        out: List[NormalizedResult] = []
        for r in results:
            url = safe_get(r, "url", default="")
            if not url:
                continue
            out.append(
                NormalizedResult(
                    url=url,
                    title=safe_get(r, "title", default="") or "",
                    snippet=safe_get(r, "description", default="") or "",
                    score=None,  # Brave doesn't expose a numeric score.
                    published_at=safe_get(r, "page_age"),
                    source_kind="web",
                    provider=self.name,
                    raw=r,
                )
            )
        return out
