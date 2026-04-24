"""Op-level tests — fallback chains, receipt shape, redaction."""

from __future__ import annotations

import json

import pytest

from wsc import audit
from wsc.ops import discover, docs, fetch, plan, search
from wsc.providers import base as provider_base


@pytest.fixture
def with_keys(monkeypatch):
    """Pretend every paid provider has a key so registry returns instances."""
    monkeypatch.setenv("EXA_API_KEY", "exa_test")
    monkeypatch.setenv("TAVILY_API_KEY", "tvly_test")
    monkeypatch.setenv("FIRECRAWL_API_KEY", "fc_test")
    monkeypatch.setenv("BRAVE_API_KEY", "brave_test")
    yield


def _patch_http(monkeypatch, fn):
    """Patch the http_request symbol everywhere it's bound."""
    import wsc.providers.base as base_mod
    import wsc.providers.brave as brave_mod
    import wsc.providers.context7 as ctx_mod
    import wsc.providers.duckduckgo as ddg_mod
    import wsc.providers.exa as exa_mod
    import wsc.providers.firecrawl as fc_mod
    import wsc.providers.tavily as tav_mod

    for mod in (base_mod, brave_mod, ctx_mod, ddg_mod, exa_mod, fc_mod, tav_mod):
        monkeypatch.setattr(mod, "http_request", fn)


# --- discover --------------------------------------------------------------


def test_discover_uses_exa_when_key_present(monkeypatch, with_keys):
    calls = []

    def fake_http(url, **kw):
        calls.append(url)
        return {
            "json": {
                "results": [
                    {"url": "https://a.com", "title": "A", "score": 0.9, "text": "..."}
                ]
            }
        }

    _patch_http(monkeypatch, fake_http)
    out = discover.run("alternatives to react", num_results=3)
    assert out["ok"] is True
    assert out["provider"] == "exa"
    assert out["fallback_chain"] == []
    assert out["status"] == "ok"
    assert any("api.exa.ai" in u for u in calls)


def test_discover_falls_back_to_tavily_when_exa_missing(monkeypatch):
    # Only Tavily has a key.
    monkeypatch.setenv("TAVILY_API_KEY", "tvly_test")

    def fake_http(url, **kw):
        return {"json": {"results": [{"url": "https://t.com", "title": "T", "content": "x"}]}}

    _patch_http(monkeypatch, fake_http)
    out = discover.run("hello", num_results=2)
    assert out["ok"] is True
    assert out["provider"] == "tavily"
    assert out["status"] == "degraded"
    assert out["fallback_chain"][0]["from"] == "exa"
    assert out["fallback_chain"][0]["reason"] == "missing_key"


def test_discover_records_receipt_with_fallback_chain(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "tvly_test")
    _patch_http(
        monkeypatch,
        lambda *a, **kw: {"json": {"results": [{"url": "https://t.com", "title": "T", "content": "x"}]}},
    )
    discover.run("hello")
    events = audit.tail(lines=5)["events"]
    assert events
    last = events[-1]
    assert last["op"] == "discover"
    assert last["provider"] == "tavily"
    assert any(step["from"] == "exa" for step in last["fallback_chain"])


# --- search ----------------------------------------------------------------


def test_search_falls_through_all_keyed_providers_to_duckduckgo(monkeypatch):
    """No keys for tavily/brave; ddg has no key requirement, must succeed."""

    def fake_http(url, **kw):
        # Return DDG-shaped HTML when ddg endpoint is hit.
        if "duckduckgo" in url:
            return {
                "text": (
                    '<a class="result__a" href="https://example.com/x">Example</a>'
                    '<a class="result__snippet" href="#">snippet</a>'
                )
            }
        return {"json": {}}

    _patch_http(monkeypatch, fake_http)
    out = search.run("hello")
    assert out["ok"] is True
    assert out["provider"] == "duckduckgo"
    assert out["status"] == "degraded"
    chain = out["fallback_chain"]
    assert any(step["from"] == "tavily" for step in chain)
    assert any(step["from"] == "brave" for step in chain)


# --- fetch -----------------------------------------------------------------


def test_fetch_uses_firecrawl_when_key_present(monkeypatch, with_keys):
    payload = {
        "success": True,
        "data": {
            "markdown": "# Page",
            "metadata": {"title": "Page", "sourceURL": "https://example.com"},
        },
    }
    _patch_http(monkeypatch, lambda *a, **kw: {"json": payload})
    out = fetch.run("https://example.com")
    assert out["ok"] is True
    assert out["provider"] == "firecrawl"
    assert out["status"] == "ok"


def test_fetch_falls_back_to_urllib_when_firecrawl_missing(monkeypatch):
    """No firecrawl key → urllib stdlib fallback. Patch urlopen to feed a tiny HTML."""

    class FakeResp:
        status = 200
        headers = {"content-type": "text/html; charset=utf-8"}

        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def read(self):
            return b"<html><head><title>tiny</title></head><body>hello</body></html>"

    monkeypatch.setattr("wsc.ops.fetch.urllib.request.urlopen", lambda req, timeout=30.0: FakeResp())
    monkeypatch.setattr(FakeResp, "headers", type("H", (), {"get_content_charset": lambda self: "utf-8"})())
    out = fetch.run("https://example.com")
    assert out["ok"] is True
    assert out["provider"] == "urllib"
    assert out["status"] == "degraded"
    chain = out["fallback_chain"]
    assert any(step["from"] == "firecrawl" for step in chain)


# --- crawl gate ------------------------------------------------------------


def test_crawl_gate_blocks_50_pages_without_apply():
    out = __import__("wsc.ops.crawl", fromlist=["run"]).run(
        "https://example.com", max_pages=50, apply=False
    )
    assert out["ok"] is False
    assert "--apply" in out["error"]
    assert out["returncode"] == 2


def test_crawl_gate_blocks_500_pages_without_deep_apply():
    out = __import__("wsc.ops.crawl", fromlist=["run"]).run(
        "https://example.com", max_pages=500, apply=True, deep_apply=False
    )
    assert out["ok"] is False
    assert "--i-know-this-burns-credits" in out["error"]


# --- plan dispatch ---------------------------------------------------------


def test_plan_routes_react_query_to_docs(monkeypatch):
    """Plan for "react useState" should dispatch to docs."""
    captured = {}

    def fake_docs_run(library, **kwargs):
        captured["library"] = library
        captured["kwargs"] = kwargs
        return {"ok": True, "operation": "docs", "library": library, "returncode": 0, "status": "ok"}

    monkeypatch.setattr("wsc.ops.plan.docs.run", fake_docs_run)
    out = plan.run("react useState")
    assert out["ok"] is True
    assert out["dispatched_op"] == "docs"
    assert captured["library"] == "react useState"


def test_plan_writes_top_level_receipt(monkeypatch):
    monkeypatch.setattr(
        "wsc.ops.plan.docs.run",
        lambda *a, **kw: {"ok": True, "operation": "docs", "returncode": 0, "status": "ok"},
    )
    plan.run("react useState")
    events = audit.tail(lines=5)["events"]
    plan_events = [e for e in events if e["op"] == "plan"]
    assert plan_events
    pe = plan_events[-1]
    assert pe["route_decision"]["recommended_op"] == "docs"
    assert pe["dispatched_op"] == "docs"


# --- redaction in receipt --------------------------------------------------


def test_receipt_redacts_token_in_selected_urls(monkeypatch):
    """Selected URLs that contain secret query params get redacted on disk."""
    monkeypatch.setenv("EXA_API_KEY", "exa_test")
    _patch_http(
        monkeypatch,
        lambda *a, **kw: {
            "json": {
                "results": [
                    {
                        "url": "https://example.com/?token=SECRET&q=ok",
                        "title": "X",
                        "score": 0.5,
                    }
                ]
            }
        },
    )
    discover.run("hello")
    raw = audit.audit_path().read_text(encoding="utf-8")
    assert "SECRET" not in raw
    assert "q=ok" in raw
