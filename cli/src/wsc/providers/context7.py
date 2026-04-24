"""Context7 — official library docs lookup.

Context7 publishes a small REST surface alongside its MCP server:

* ``GET https://context7.com/api/v1/search?query=<lib>``
* ``GET https://context7.com/api/v1/<library_id>?topic=<x>&type=txt&tokens=<n>``

The free tier works without a key but with rate limits. Authenticated
requests use ``Authorization: Bearer <CONTEXT7_API_KEY>``.

Schema notes:

* Search returns ``results: [{title, id, description, ...}]`` where ``id``
  starts with ``/`` (e.g. ``/vercel/next.js``).
* Library docs return plain text/markdown when ``type=txt``.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from wsc.providers.base import (
    FetchedPage,
    NormalizedResult,
    Provider,
    ProviderError,
    http_request,
    safe_get,
)

BASE_URL = "https://context7.com/api/v1"


class Context7Provider(Provider):
    name = "context7"
    schema_version = "context7-v1-2026-04"

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key

    def _headers(self) -> Dict[str, str]:
        h = {"accept": "application/json"}
        if self.api_key:
            h["authorization"] = f"Bearer {self.api_key}"
        return h

    def resolve_library(self, library: str, *, timeout: float = 20.0) -> List[NormalizedResult]:
        """Search Context7 for libraries matching ``library``."""

        response = http_request(
            f"{BASE_URL}/search",
            method="GET",
            headers=self._headers(),
            params={"query": library},
            timeout=timeout,
        )
        return self.normalize_search(response.get("json") or {})

    def normalize_search(self, payload: Dict[str, Any]) -> List[NormalizedResult]:
        results = safe_get(payload, "results", default=[]) or []
        out: List[NormalizedResult] = []
        for r in results:
            lib_id = safe_get(r, "id") or safe_get(r, "libraryId")
            if not lib_id:
                continue
            url = f"https://context7.com/api/v1{lib_id}"
            out.append(
                NormalizedResult(
                    url=url,
                    title=safe_get(r, "title", default=lib_id) or lib_id,
                    snippet=safe_get(r, "description", default="") or "",
                    source_kind="doc",
                    provider=self.name,
                    raw=r,
                )
            )
        return out

    def get_docs(
        self,
        library_id: str,
        *,
        topic: Optional[str] = None,
        tokens: int = 4000,
        timeout: float = 30.0,
    ) -> FetchedPage:
        """Fetch docs for a resolved library id (e.g. ``/vercel/next.js``)."""

        if not library_id.startswith("/"):
            library_id = "/" + library_id
        params = {"type": "txt", "tokens": str(int(tokens))}
        if topic:
            params["topic"] = topic
        url = f"{BASE_URL}{library_id}"
        response = http_request(
            url,
            method="GET",
            headers=self._headers(),
            params=params,
            timeout=timeout,
        )
        text = response.get("text") or ""
        if not text.strip():
            raise ProviderError(f"context7: empty docs response for {library_id}")
        return FetchedPage(
            url=url,
            title=library_id.lstrip("/"),
            markdown=text,
            metadata={"library_id": library_id, "topic": topic, "tokens": tokens},
            provider=self.name,
            status="ok",
        )
