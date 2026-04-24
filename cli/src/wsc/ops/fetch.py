"""wsc fetch — clean a known URL via Firecrawl, falling back to a stdlib
``urllib`` + ``html.parser`` extractor (degraded; no JS, no PDF).
"""

from __future__ import annotations

import html as _html
import re
import urllib.error
import urllib.request
from typing import Any, Dict, Optional

from wsc import audit
from wsc._url import normalize_url
from wsc.ops._chain import filtered_chain, query_fingerprint, run_chain
from wsc.providers import FetchedPage


def run(
    url: str,
    *,
    formats: Optional[list] = None,
    screenshot: bool = False,
    correlation_id: Optional[str] = None,
    no_receipt: bool = False,
) -> Dict[str, Any]:
    chain = filtered_chain("url_fetch") or ["firecrawl"]

    def firecrawl_action(provider):
        return provider.scrape(url, formats=formats, screenshot=screenshot)

    actions = {"firecrawl": firecrawl_action}

    with audit.start_call(
        "fetch", provider="firecrawl",
        correlation_id=correlation_id, no_receipt=no_receipt,
    ) as receipt:
        receipt.update(query_fingerprint(url))
        receipt["params"] = {"formats": formats, "screenshot": screenshot}
        active, page, fallback = run_chain(chain, actions)
        receipt["fallback_chain"] = list(fallback)

        if active is None:
            # Stdlib fallback. Degraded on purpose: no JS, no PDF, no CSS removal.
            try:
                page = _stdlib_fetch(url)
                receipt["fallback_chain"].append({"from": "firecrawl", "to": "urllib", "reason": "all_providers_failed"})
                receipt["provider"] = "urllib"
                receipt["status"] = "degraded"
                receipt["selected_urls"] = [page.url]
                receipt["selected_count"] = 1
                receipt["results_count"] = 1
                return {
                    "ok": True,
                    "operation": "fetch",
                    "provider": "urllib",
                    "page": page.to_dict(),
                    "fallback_chain": receipt["fallback_chain"],
                    "status": "degraded",
                    "returncode": 0,
                }
            except Exception as exc:  # noqa: BLE001
                receipt["status"] = "error"
                receipt["error"] = str(exc)[:200]
                return {
                    "ok": False,
                    "operation": "fetch",
                    "provider": None,
                    "fallback_chain": receipt["fallback_chain"]
                    + [{"from": "urllib", "reason": "transport_error", "error": str(exc)[:200]}],
                    "error": f"fetch failed: {exc}",
                    "returncode": 2,
                }

        receipt["provider"] = active
        receipt["selected_urls"] = [page.url] if page.url else []
        receipt["selected_count"] = 1
        receipt["results_count"] = 1
        return {
            "ok": True,
            "operation": "fetch",
            "provider": active,
            "page": page.to_dict(),
            "fallback_chain": receipt["fallback_chain"],
            "status": page.status,
            "returncode": 0,
        }


# --- Stdlib fallback: poor-man's URL → markdown-ish text ----------------


_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\n{3,}")


def _stdlib_fetch(url: str, *, timeout: float = 30.0) -> FetchedPage:
    req = urllib.request.Request(url, headers={"user-agent": "wsc/0.1 (+stdlib fallback)"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        body = resp.read()
        encoding = resp.headers.get_content_charset() or "utf-8"
        text = body.decode(encoding, errors="replace")
    title_match = re.search(r"<title[^>]*>(.*?)</title>", text, re.IGNORECASE | re.DOTALL)
    title = _html.unescape(title_match.group(1).strip()) if title_match else url
    body_text = _html.unescape(_TAG_RE.sub("\n", text)).strip()
    body_text = _WS_RE.sub("\n\n", body_text)
    return FetchedPage(
        url=url,
        title=title,
        markdown=body_text[:50000],  # safety clamp
        provider="urllib",
        status="degraded",
        url_normalized=normalize_url(url),
    )
