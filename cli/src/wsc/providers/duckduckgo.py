"""DuckDuckGo — zero-key fallback search via the lite HTML endpoint.

This provider is **always degraded**: results lack scores, may be re-ranked
by DuckDuckGo at any time, and HTML structure is subject to change without
notice. Receipt ``status`` is set to ``degraded`` upstream so callers know.
"""

from __future__ import annotations

import html as _html
import re
from typing import Any, Dict, List, Optional

from wsc.providers.base import (
    NormalizedResult,
    Provider,
    http_request,
)

LITE_ENDPOINT = "https://html.duckduckgo.com/html/"


_RESULT_RE = re.compile(
    r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="(?P<url>[^"]+)"[^>]*>(?P<title>.*?)</a>',
    re.DOTALL | re.IGNORECASE,
)
_SNIPPET_RE = re.compile(
    r'<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(?P<snippet>.*?)</a>',
    re.DOTALL | re.IGNORECASE,
)
_TAG_RE = re.compile(r"<[^>]+>")


class DuckDuckGoProvider(Provider):
    name = "duckduckgo"
    schema_version = "ddg-html-v1-2026-04"

    def __init__(self, api_key: Optional[str] = None) -> None:  # noqa: ARG002 - signature parity
        # DuckDuckGo lite has no key; arg accepted for registry parity only.
        pass

    def search(self, query: str, *, count: int = 10, timeout: float = 30.0) -> List[NormalizedResult]:
        response = http_request(
            LITE_ENDPOINT,
            method="POST",
            headers={"content-type": "application/x-www-form-urlencoded"},
            body=f"q={_url_quote(query)}",
            timeout=timeout,
        )
        return self.normalize(response.get("text") or "", limit=count)

    def normalize(self, html_text: str, *, limit: int = 10) -> List[NormalizedResult]:
        if not html_text:
            return []
        urls = _RESULT_RE.findall(html_text)
        snippets = _SNIPPET_RE.findall(html_text)
        out: List[NormalizedResult] = []
        for i, (url, title_html) in enumerate(urls[:limit]):
            title = _strip_html(title_html)
            snippet = _strip_html(snippets[i]) if i < len(snippets) else ""
            url_clean = _follow_redirect(url)
            if not url_clean:
                continue
            out.append(
                NormalizedResult(
                    url=url_clean,
                    title=title,
                    snippet=snippet,
                    score=None,
                    source_kind="web",
                    provider=self.name,
                )
            )
        return out


def _strip_html(s: str) -> str:
    return _html.unescape(_TAG_RE.sub("", s)).strip()


def _url_quote(s: str) -> str:
    from urllib.parse import quote_plus

    return quote_plus(s)


_DDG_REDIRECT_RE = re.compile(r"^(?:https?:)?//duckduckgo\.com/l/\?uddg=([^&]+)", re.IGNORECASE)


def _follow_redirect(url: str) -> str:
    """DuckDuckGo wraps result URLs through ``/l/?uddg=<encoded>``."""
    m = _DDG_REDIRECT_RE.match(url)
    if not m:
        # Some results are protocol-relative — make them absolute.
        if url.startswith("//"):
            return "https:" + url
        return url
    from urllib.parse import unquote

    return unquote(m.group(1))
