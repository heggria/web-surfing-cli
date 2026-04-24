"""Auto-isolate every test so it cannot touch real ~/.config/wsc or ~/.local/state/wsc."""

import os

import pytest


@pytest.fixture(autouse=True)
def isolate_wsc_paths(monkeypatch, tmp_path):
    """Point every WSC path env var at a per-test tmp dir.

    Also clears WSC_CORRELATION_ID and any provider env keys that might
    leak across tests when developers run with their real env populated.
    """

    monkeypatch.setenv("WSC_CONFIG_DIR", str(tmp_path / "config"))
    monkeypatch.setenv("WSC_STATE_DIR", str(tmp_path / "state"))
    monkeypatch.setenv("WSC_CACHE_DIR", str(tmp_path / "cache"))
    monkeypatch.delenv("WSC_CORRELATION_ID", raising=False)
    monkeypatch.delenv("WSC_JSON", raising=False)
    monkeypatch.delenv("WSC_ROUTER", raising=False)
    for key in (
        "EXA_API_KEY",
        "TAVILY_API_KEY",
        "FIRECRAWL_API_KEY",
        "BRAVE_API_KEY",
        "BRAVE_SEARCH_API_KEY",
        "CONTEXT7_API_KEY",
    ):
        monkeypatch.delenv(key, raising=False)
    yield
