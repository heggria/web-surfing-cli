"""End-to-end smoke tests for the wsc CLI.

These exercise argparse and the JSON contract, but rely on conftest.py to
isolate config/state/cache dirs to a tmp_path so the audit log and keys file
don't leak across machines.
"""

import json
import subprocess
import sys

import pytest

from wsc.cli import main


def _run(*args, env=None):
    """Run wsc.cli as a subprocess with --json so output is parseable."""
    cmd = [sys.executable, "-m", "wsc.cli", "--json", *args]
    return subprocess.run(cmd, capture_output=True, text=True, env=env)


def test_help_via_subprocess(monkeypatch):
    env = {**dict(__import__("os").environ)}
    result = subprocess.run(
        [sys.executable, "-m", "wsc.cli", "--help"], capture_output=True, text=True, env=env
    )
    assert result.returncode == 0
    assert "Unified evidence-acquisition" in result.stdout


def test_init_via_main_returns_zero():
    rc = main(["--json", "init"])
    assert rc == 0


def test_init_payload_lists_paths(capsys):
    rc = main(["--json", "init"])
    out = capsys.readouterr().out
    payload = json.loads(out)
    assert payload["ok"] is True
    assert payload["operation"] == "init"
    assert "keys_path" in payload["paths"]


def test_config_doctor_returns_no_key_for_exa(capsys):
    main(["--json", "init"])
    capsys.readouterr()  # discard init output
    rc = main(["--json", "config", "doctor"])
    payload = json.loads(capsys.readouterr().out)
    rows = {r["provider"]: r for r in payload["providers"]}
    assert rows["exa"]["status"] == "no_key"
    # context7 free tier is enough to make doctor return ok.
    assert rc == 0


def test_config_disable_writes_flag(capsys):
    main(["--json", "init"])
    capsys.readouterr()
    rc = main(["--json", "config", "disable", "exa"])
    assert rc == 0
    payload_disable = json.loads(capsys.readouterr().out)
    assert payload_disable["operation"] == "config.disable"
    main(["--json", "config", "doctor"])
    payload = json.loads(capsys.readouterr().out)
    rows = {r["provider"]: r for r in payload["providers"]}
    assert rows["exa"]["status"] == "disabled"


def test_receipts_tail_empty(capsys):
    rc = main(["--json", "receipts", "tail"])
    assert rc == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["events"] == []
    assert payload["operation"] == "receipts.tail"


def test_plan_explain_for_library_query(capsys):
    rc = main(["--json", "plan", "react useState", "--explain"])
    assert rc == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["operation"] == "plan.explain"
    assert payload["decision"]["recommended_op"] == "docs"
    assert payload["decision"]["recommended_provider"] == "context7"


def test_plan_explain_for_url(capsys):
    rc = main(["--json", "plan", "https://example.com/docs", "--explain"])
    assert rc == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["decision"]["recommended_op"] == "fetch"


def test_plan_without_explain_returns_64_in_m1(capsys):
    rc = main(["--json", "plan", "react useState"])
    assert rc == 64
    payload = json.loads(capsys.readouterr().out)
    assert payload["operation"] == "plan"
    assert "M2" in payload["error"]
    # Decision is still present so callers see the route.
    assert payload["decision"]["recommended_op"] == "docs"


def test_m2_subcommands_return_64(capsys):
    for sub in ("docs", "discover", "fetch", "crawl", "search"):
        rc = main(["--json", sub])
        assert rc == 64
        payload = json.loads(capsys.readouterr().out)
        assert payload["operation"] == sub


def test_plan_explain_writes_no_receipt(capsys):
    main(["--json", "init"])
    capsys.readouterr()
    main(["--json", "plan", "react useState", "--explain"])
    capsys.readouterr()
    main(["--json", "receipts", "tail"])
    payload = json.loads(capsys.readouterr().out)
    assert payload["events"] == []
