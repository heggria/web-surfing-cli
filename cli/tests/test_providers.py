"""Provider normalization tests — feed each provider a realistic response
shape captured from public docs, assert NormalizedResult / FetchedPage
shape, and verify the error taxonomy classifies HTTP errors correctly.
"""

from __future__ import annotations

import io
import json
import urllib.error

import pytest

from wsc.providers import base
from wsc.providers.brave import BraveProvider
from wsc.providers.context7 import Context7Provider
from wsc.providers.duckduckgo import DuckDuckGoProvider
from wsc.providers.exa import ExaProvider
from wsc.providers.firecrawl import FirecrawlProvider
from wsc.providers.tavily import TavilyProvider


# --- safe_get --------------------------------------------------------------


def test_safe_get_returns_default_on_missing_key():
    assert base.safe_get({"a": {"b": 1}}, "a", "missing", default="fb") == "fb"


def test_safe_get_walks_lists():
    assert base.safe_get({"r": [{"x": 7}]}, "r", 0, "x") == 7


def test_safe_get_handles_none_root():
    assert base.safe_get(None, "x", default=42) == 42


# --- NormalizedResult ------------------------------------------------------


def test_normalized_result_auto_normalizes_url():
    r = base.NormalizedResult(url="HTTPS://Example.COM:443/Path?b=1&a=2", title="x")
    assert r.url_normalized == "https://example.com/Path?a=2&b=1"


def test_normalized_result_to_dict_redacts_secret_url_params():
    r = base.NormalizedResult(url="https://x.com/?token=SECRET&q=hi", title="x", provider="exa")
    d = r.to_dict()
    assert "SECRET" not in d["url"]
    assert "q=hi" in d["url"]


# --- Exa --------------------------------------------------------------------


EXA_PAYLOAD = {
    "results": [
        {
            "id": "1",
            "title": "Speculative Decoding",
            "url": "https://arxiv.org/abs/2211.17192",
            "publishedDate": "2024-04-01",
            "score": 0.91,
            "text": "Recent work on speculative decoding ...",
        },
        {
            "id": "2",
            "title": "DeepSeek paper",
            "url": "https://example.com/paper",
            "score": 0.55,
        },
    ]
}


def test_exa_normalize_picks_url_title_score():
    out = ExaProvider().normalize(EXA_PAYLOAD)
    assert len(out) == 2
    assert out[0].url == "https://arxiv.org/abs/2211.17192"
    assert out[0].title == "Speculative Decoding"
    assert out[0].score == 0.91
    assert out[0].published_at == "2024-04-01"
    assert out[0].provider == "exa"


def test_exa_normalize_drops_results_without_url():
    payload = {"results": [{"title": "no url"}, {"url": "https://x.com", "title": "ok"}]}
    out = ExaProvider().normalize(payload)
    assert len(out) == 1
    assert out[0].url == "https://x.com"


def test_exa_search_calls_api_with_post_and_x_api_key(monkeypatch):
    captured = {}

    def fake_http(url, **kwargs):
        captured["url"] = url
        captured["method"] = kwargs.get("method")
        captured["headers"] = kwargs.get("headers")
        captured["body"] = kwargs.get("body")
        return {"json": EXA_PAYLOAD}

    monkeypatch.setattr("wsc.providers.exa.http_request", fake_http)
    out = ExaProvider(api_key="exa_test").search("speculative decoding", num_results=3)
    assert len(out) == 2
    assert captured["url"] == "https://api.exa.ai/search"
    assert captured["method"] == "POST"
    assert captured["headers"]["x-api-key"] == "exa_test"
    assert captured["body"]["query"] == "speculative decoding"
    assert captured["body"]["numResults"] == 3


def test_exa_missing_key_raises():
    with pytest.raises(base.MissingKeyError):
        ExaProvider().search("x")


# --- Tavily ----------------------------------------------------------------


TAVILY_PAYLOAD = {
    "answer": "The latest is 1.0",
    "results": [
        {
            "title": "Release notes",
            "url": "https://example.com/release",
            "content": "shipped on 2026-04-21",
            "score": 0.78,
            "published_date": "2026-04-21",
        }
    ],
}


def test_tavily_normalize_picks_content_as_snippet():
    out = TavilyProvider().normalize(TAVILY_PAYLOAD)
    assert len(out) == 1
    r = out[0]
    assert r.title == "Release notes"
    assert r.snippet.startswith("shipped on")
    assert r.score == 0.78
    assert r.published_at == "2026-04-21"


def test_tavily_search_sends_api_key_in_body(monkeypatch):
    captured = {}

    def fake_http(url, **kwargs):
        captured["body"] = kwargs.get("body")
        return {"json": TAVILY_PAYLOAD}

    monkeypatch.setattr("wsc.providers.tavily.http_request", fake_http)
    TavilyProvider(api_key="tvly_test").search("hi", max_results=5)
    assert captured["body"]["api_key"] == "tvly_test"
    assert captured["body"]["query"] == "hi"
    assert captured["body"]["max_results"] == 5


# --- Firecrawl --------------------------------------------------------------


FIRECRAWL_SCRAPE_OK = {
    "success": True,
    "data": {
        "markdown": "# Title\n\nbody",
        "metadata": {"title": "Title", "sourceURL": "https://example.com/page"},
    },
}


def test_firecrawl_scrape_returns_fetched_page(monkeypatch):
    monkeypatch.setattr(
        "wsc.providers.firecrawl.http_request",
        lambda *a, **kw: {"json": FIRECRAWL_SCRAPE_OK},
    )
    page = FirecrawlProvider(api_key="fc_test").scrape("https://example.com/page")
    assert page.url == "https://example.com/page"
    assert page.title == "Title"
    assert page.markdown.startswith("# Title")
    assert page.provider == "firecrawl"
    assert page.status == "ok"


def test_firecrawl_scrape_raises_on_failure_payload(monkeypatch):
    monkeypatch.setattr(
        "wsc.providers.firecrawl.http_request",
        lambda *a, **kw: {"json": {"success": False, "error": "blocked"}},
    )
    with pytest.raises(base.ProviderError):
        FirecrawlProvider(api_key="fc_test").scrape("https://example.com")


# --- Brave -----------------------------------------------------------------


BRAVE_PAYLOAD = {
    "web": {
        "results": [
            {
                "title": "Example",
                "url": "https://example.com",
                "description": "An example",
                "page_age": "2 days ago",
            }
        ]
    }
}


def test_brave_normalize_extracts_web_results():
    out = BraveProvider().normalize(BRAVE_PAYLOAD)
    assert len(out) == 1
    r = out[0]
    assert r.url == "https://example.com"
    assert r.snippet == "An example"
    assert r.published_at == "2 days ago"


def test_brave_search_uses_subscription_token(monkeypatch):
    captured = {}

    def fake_http(url, **kwargs):
        captured["headers"] = kwargs["headers"]
        captured["params"] = kwargs.get("params")
        return {"json": BRAVE_PAYLOAD}

    monkeypatch.setattr("wsc.providers.brave.http_request", fake_http)
    BraveProvider(api_key="BSA_test").search("hi", count=3)
    assert captured["headers"]["x-subscription-token"] == "BSA_test"
    assert captured["params"]["q"] == "hi"
    assert captured["params"]["count"] == "3"


# --- DuckDuckGo ------------------------------------------------------------


DDG_HTML = """<html><body>
<div class="result">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa">Example A</a>
  <a class="result__snippet" href="#">snippet about A</a>
</div>
<div class="result">
  <a class="result__a" href="https://example.com/b">Example B</a>
  <a class="result__snippet" href="#">snippet about &amp;mp; B</a>
</div>
</body></html>"""


def test_duckduckgo_normalize_unwraps_redirect_and_decodes_entities():
    out = DuckDuckGoProvider().normalize(DDG_HTML)
    assert len(out) == 2
    assert out[0].url == "https://example.com/a"
    assert out[0].title == "Example A"
    assert out[1].url == "https://example.com/b"
    assert "snippet about" in out[1].snippet


# --- Context7 --------------------------------------------------------------


CONTEXT7_SEARCH_PAYLOAD = {
    "results": [
        {"id": "/vercel/next.js", "title": "Next.js", "description": "React framework"},
        {"id": "/facebook/react", "title": "React", "description": "UI library"},
    ]
}


def test_context7_resolve_returns_normalized_results(monkeypatch):
    monkeypatch.setattr(
        "wsc.providers.context7.http_request",
        lambda *a, **kw: {"json": CONTEXT7_SEARCH_PAYLOAD},
    )
    out = Context7Provider().resolve_library("react")
    assert len(out) == 2
    assert out[0].url == "https://context7.com/api/v1/vercel/next.js"
    assert out[0].source_kind == "doc"


def test_context7_get_docs_returns_fetched_page(monkeypatch):
    monkeypatch.setattr(
        "wsc.providers.context7.http_request",
        lambda *a, **kw: {"text": "# React docs\n\nUse hooks like this."},
    )
    page = Context7Provider().get_docs("/facebook/react", topic="hooks")
    assert "React docs" in page.markdown
    assert page.metadata["library_id"] == "/facebook/react"
    assert page.metadata["topic"] == "hooks"


# --- HTTP error mapping ----------------------------------------------------


class _FakeHTTPError(urllib.error.HTTPError):
    def __init__(self, code, reason, headers, body=b""):
        super().__init__("http://test", code, reason, headers, io.BytesIO(body))
        self._body = body

    def read(self):  # type: ignore[override]
        return self._body


class _Headers(dict):
    def get(self, key, default=None):
        return super().get(key, default)


def test_http_request_maps_429_to_rate_limit_error(monkeypatch):
    def fake_urlopen(*a, **kw):
        raise _FakeHTTPError(429, "Too Many", _Headers({"Retry-After": "12"}))

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    with pytest.raises(base.RateLimitError) as excinfo:
        base.http_request("http://test/x")
    assert excinfo.value.retry_after == 12.0


def test_http_request_maps_401_to_auth_error(monkeypatch):
    monkeypatch.setattr(
        "urllib.request.urlopen",
        lambda *a, **kw: (_ for _ in ()).throw(_FakeHTTPError(401, "Unauthorized", _Headers())),
    )
    with pytest.raises(base.AuthError):
        base.http_request("http://test/x")


def test_http_request_maps_url_error_to_transport_error(monkeypatch):
    def fake_urlopen(*a, **kw):
        raise urllib.error.URLError("DNS failure")

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)
    with pytest.raises(base.TransportError):
        base.http_request("http://nowhere/x")
