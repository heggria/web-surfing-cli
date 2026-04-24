"""Tests for wsc.config — init, key precedence, kill-switch, doctor."""

import os
from pathlib import Path

import pytest

from wsc import config


def test_init_creates_dirs_and_templates():
    out = config.init()
    assert out["ok"]
    actions = out["actions"]
    assert any("created dir" in a for a in actions)
    assert any("keys.ini" in a for a in actions)
    assert any("budget.ini" in a for a in actions)
    assert config.keys_path().exists()
    assert config.budget_path().exists()
    # Permissions tightened to user-only on POSIX.
    assert (config.keys_path().stat().st_mode & 0o777) == 0o600


def test_init_is_idempotent():
    first = config.init()
    second = config.init()
    # Second run does no work because files already exist.
    assert second["actions"] == [] or all("created dir" not in a and "wrote" not in a for a in second["actions"])


def test_init_force_overwrites():
    config.init()
    config.keys_path().write_text("# user edits\n", encoding="utf-8")
    out = config.init(force=True)
    assert any("wrote" in a for a in out["actions"])
    assert "user edits" not in config.keys_path().read_text(encoding="utf-8")


def test_load_keys_env_overrides_file(monkeypatch):
    config.init()
    config.keys_path().write_text("[exa]\napi_key = file_key\n", encoding="utf-8")
    monkeypatch.setenv("EXA_API_KEY", "env_key")
    keys = config.load_keys()
    assert keys.get("exa") == "env_key"


def test_load_keys_falls_back_to_file_when_no_env(monkeypatch):
    config.init()
    config.keys_path().write_text("[exa]\napi_key = file_key\n", encoding="utf-8")
    monkeypatch.delenv("EXA_API_KEY", raising=False)
    keys = config.load_keys()
    assert keys.get("exa") == "file_key"


def test_load_budget_parses_caps():
    config.init()
    config.budget_path().write_text(
        "[exa]\ndaily_credit_cap = 100\ndaily_usd_cap = 5.5\n",
        encoding="utf-8",
    )
    b = config.load_budget()
    assert b.for_provider("exa") == {"daily_credit_cap": 100.0, "daily_usd_cap": 5.5}
    assert b.for_provider("tavily") == {}


def test_disable_enable_round_trip():
    config.init()
    config.disable("exa")
    assert config.is_disabled("exa")
    was = config.enable("exa")
    assert was
    assert not config.is_disabled("exa")


def test_disable_unknown_provider_raises():
    with pytest.raises(ValueError):
        config.disable("not-a-provider")


def test_doctor_marks_no_key_when_provider_needs_one():
    config.init()
    out = config.doctor()
    rows = {r["provider"]: r for r in out["providers"]}
    assert rows["exa"]["status"] == "no_key"
    assert rows["context7"]["status"] == "ready"  # context7 is keyless (free tier)
    assert rows["duckduckgo"]["status"] == "degraded"
    # context7 alone is enough to be "workable" → ok=True even without other keys.
    assert out["ok"] is True
    assert out["returncode"] == 0


def test_doctor_returncode_is_one_when_context7_disabled_and_no_other_keys():
    config.init()
    config.disable("context7")
    out = config.doctor()
    # No primary provider ready → non-zero exit + hint.
    assert out["ok"] is False
    assert out["returncode"] == 1
    assert "hint" in out


def test_doctor_marks_ready_when_env_key_set(monkeypatch):
    config.init()
    monkeypatch.setenv("EXA_API_KEY", "x")
    out = config.doctor()
    rows = {r["provider"]: r for r in out["providers"]}
    assert rows["exa"]["status"] == "ready"
    # Now we have at least one primary provider ready.
    assert out["ok"] is True


def test_doctor_marks_disabled():
    config.init()
    config.disable("exa")
    out = config.doctor()
    rows = {r["provider"]: r for r in out["providers"]}
    assert rows["exa"]["status"] == "disabled"


def test_doctor_live_chains_only_include_available_providers(monkeypatch):
    config.init()
    monkeypatch.setenv("TAVILY_API_KEY", "x")
    monkeypatch.setenv("FIRECRAWL_API_KEY", "y")
    out = config.doctor()
    chains = out["role_fallback_chains"]
    # exa missing → semantic_discovery starts at tavily
    assert chains["semantic_discovery"][0] == "tavily"
    # url_fetch only has firecrawl
    assert chains["url_fetch"] == ["firecrawl"]
