"""Firecrawl — clean a URL (scrape) or crawl a site.

Endpoints (https://docs.firecrawl.dev/api-reference):

* ``POST https://api.firecrawl.dev/v1/scrape``
* ``POST https://api.firecrawl.dev/v1/crawl``  (returns a job id)
* ``GET  https://api.firecrawl.dev/v1/crawl/{id}``  (poll)

Auth: ``Authorization: Bearer <FIRECRAWL_API_KEY>``.

v0.1 implements scrape end-to-end and crawl-init only (caller drives the
poll loop via ``poll_crawl``); ``ops/crawl.py`` does a small bounded loop
guarded by ``--apply`` and the per-day budget cap.
"""

from __future__ import annotations

import time
from typing import Any, Dict, List, Optional

from wsc.providers.base import (
    FetchedPage,
    NormalizedResult,
    Provider,
    ProviderError,
    http_request,
    MissingKeyError,
    safe_get,
)

BASE_URL = "https://api.firecrawl.dev/v1"


class FirecrawlProvider(Provider):
    name = "firecrawl"
    schema_version = "firecrawl-v1-2026-04"

    def __init__(self, api_key: Optional[str] = None) -> None:
        self.api_key = api_key

    def _ensure_key(self) -> str:
        if not self.api_key:
            raise MissingKeyError(self.name)
        return self.api_key

    def _auth_headers(self) -> Dict[str, str]:
        return {"authorization": f"Bearer {self._ensure_key()}"}

    # -- scrape -----------------------------------------------------------

    def scrape(
        self,
        url: str,
        *,
        formats: Optional[List[str]] = None,
        only_main_content: bool = True,
        screenshot: bool = False,
        timeout: float = 60.0,
    ) -> FetchedPage:
        body: Dict[str, Any] = {
            "url": url,
            "formats": list(formats or ["markdown"]),
            "onlyMainContent": bool(only_main_content),
        }
        if screenshot:
            # Firecrawl returns a URL to the screenshot when this format is requested.
            if "screenshot" not in body["formats"]:
                body["formats"].append("screenshot")
        response = http_request(
            f"{BASE_URL}/scrape",
            method="POST",
            headers=self._auth_headers(),
            body=body,
            timeout=timeout,
        )
        return self._normalize_scrape(response.get("json") or {}, requested_url=url)

    def _normalize_scrape(self, payload: Dict[str, Any], *, requested_url: str) -> FetchedPage:
        if not safe_get(payload, "success", default=False):
            err = safe_get(payload, "error") or "scrape failed"
            raise ProviderError(f"firecrawl: {err}")
        data = safe_get(payload, "data", default={}) or {}
        url = safe_get(data, "metadata", "sourceURL", default=requested_url) or requested_url
        return FetchedPage(
            url=url,
            title=safe_get(data, "metadata", "title", default="") or "",
            markdown=safe_get(data, "markdown", default="") or "",
            html=safe_get(data, "html"),
            metadata=safe_get(data, "metadata", default={}) or {},
            provider=self.name,
            fetched_at=safe_get(data, "metadata", "fetchTime"),
            status="ok",
        )

    # -- crawl ------------------------------------------------------------

    def start_crawl(
        self,
        url: str,
        *,
        limit: int = 10,
        include_paths: Optional[List[str]] = None,
        exclude_paths: Optional[List[str]] = None,
        formats: Optional[List[str]] = None,
        timeout: float = 60.0,
    ) -> str:
        body: Dict[str, Any] = {
            "url": url,
            "limit": int(limit),
            "scrapeOptions": {"formats": list(formats or ["markdown"])},
        }
        if include_paths:
            body["includePaths"] = include_paths
        if exclude_paths:
            body["excludePaths"] = exclude_paths
        response = http_request(
            f"{BASE_URL}/crawl",
            method="POST",
            headers=self._auth_headers(),
            body=body,
            timeout=timeout,
        )
        payload = response.get("json") or {}
        if not safe_get(payload, "success", default=False):
            raise ProviderError(f"firecrawl: crawl failed to start: {safe_get(payload, 'error')!r}")
        job_id = safe_get(payload, "id")
        if not job_id:
            raise ProviderError(f"firecrawl: crawl response missing id: keys={list(payload.keys())}")
        return job_id

    def poll_crawl(self, job_id: str, *, timeout: float = 30.0) -> Dict[str, Any]:
        response = http_request(
            f"{BASE_URL}/crawl/{job_id}",
            method="GET",
            headers=self._auth_headers(),
            timeout=timeout,
        )
        return response.get("json") or {}

    def crawl(
        self,
        url: str,
        *,
        limit: int = 10,
        include_paths: Optional[List[str]] = None,
        exclude_paths: Optional[List[str]] = None,
        formats: Optional[List[str]] = None,
        poll_interval: float = 2.0,
        max_wait: float = 300.0,
    ) -> List[FetchedPage]:
        job_id = self.start_crawl(
            url,
            limit=limit,
            include_paths=include_paths,
            exclude_paths=exclude_paths,
            formats=formats,
        )
        deadline = time.time() + max_wait
        while time.time() < deadline:
            status = self.poll_crawl(job_id)
            state = safe_get(status, "status")
            if state in ("completed", "failed"):
                if state == "failed":
                    raise ProviderError(f"firecrawl: crawl {job_id} failed: {safe_get(status, 'error')!r}")
                pages_raw = safe_get(status, "data", default=[]) or []
                return [self._page_from_crawl_item(p, job_id=job_id) for p in pages_raw]
            time.sleep(poll_interval)
        raise ProviderError(f"firecrawl: crawl {job_id} did not complete within {max_wait}s")

    def _page_from_crawl_item(self, item: Dict[str, Any], *, job_id: str) -> FetchedPage:
        url = safe_get(item, "metadata", "sourceURL", default="") or safe_get(item, "url", default="")
        return FetchedPage(
            url=url or "",
            title=safe_get(item, "metadata", "title", default="") or "",
            markdown=safe_get(item, "markdown", default="") or "",
            html=safe_get(item, "html"),
            metadata={"crawl_job_id": job_id, **(safe_get(item, "metadata", default={}) or {})},
            provider=self.name,
            fetched_at=safe_get(item, "metadata", "fetchTime"),
            status="ok",
        )

    # -- discovery via crawl results (used by ops/discover.py for fallback) ---

    def search_results_from_pages(self, pages: List[FetchedPage]) -> List[NormalizedResult]:
        out: List[NormalizedResult] = []
        for p in pages:
            if not p.url:
                continue
            out.append(
                NormalizedResult(
                    url=p.url,
                    title=p.title or p.url,
                    snippet=(p.markdown[:240] if p.markdown else ""),
                    source_kind="web",
                    provider=self.name,
                )
            )
        return out
