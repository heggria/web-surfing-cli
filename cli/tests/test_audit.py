"""Tests for wsc.audit — receipts, redaction in payload, concurrency."""

import json
import multiprocessing
import os
import sys
from pathlib import Path

import pytest

from wsc import audit


def _read_lines(path: Path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def test_record_writes_one_jsonl_line_with_ts():
    audit.record({"call_id": "abc", "op": "fetch", "provider": "firecrawl"})
    events = _read_lines(audit.audit_path())
    assert len(events) == 1
    assert events[0]["call_id"] == "abc"
    assert events[0]["op"] == "fetch"
    assert events[0]["ts"].endswith("Z")


def test_record_redacts_url_field():
    audit.record(
        {
            "op": "fetch",
            "url": "https://example.com/?token=SECRET&q=hi",
        }
    )
    line = audit.audit_path().read_text(encoding="utf-8")
    assert "SECRET" not in line
    assert "q=hi" in line


def test_record_redacts_urls_in_nested_lists():
    audit.record(
        {
            "op": "discover",
            "selected_urls": [
                "https://a.example/?api_key=X",
                "https://b.example/page",
            ],
        }
    )
    line = audit.audit_path().read_text(encoding="utf-8")
    assert "=X" not in line
    assert "https://b.example/page" in line


def test_start_call_records_duration_and_correlation(monkeypatch):
    monkeypatch.setenv("WSC_CORRELATION_ID", "corr-123")
    with audit.start_call("plan", provider="exa") as receipt:
        receipt["results_count"] = 5
    events = _read_lines(audit.audit_path())
    assert len(events) == 1
    ev = events[0]
    assert ev["op"] == "plan"
    assert ev["provider"] == "exa"
    assert ev["correlation_id"] == "corr-123"
    assert ev["status"] == "ok"
    assert ev["results_count"] == 5
    assert ev["duration_ms"] >= 0


def test_start_call_marks_error_on_exception():
    with pytest.raises(ValueError):
        with audit.start_call("fetch", provider="firecrawl"):
            raise ValueError("boom")
    ev = _read_lines(audit.audit_path())[0]
    assert ev["status"] == "error"
    assert "boom" in ev["error"]


def test_no_receipt_skips_write():
    with audit.start_call("plan", provider="exa", no_receipt=True):
        pass
    assert not audit.audit_path().exists()


def test_tail_filters_by_op_and_provider():
    audit.record({"op": "fetch", "provider": "firecrawl", "call_id": "1"})
    audit.record({"op": "discover", "provider": "exa", "call_id": "2"})
    audit.record({"op": "discover", "provider": "tavily", "call_id": "3"})
    out = audit.tail(op="discover", provider="exa")
    assert [e["call_id"] for e in out["events"]] == ["2"]


def test_summary_counts_by_op_and_provider():
    for op, provider in [
        ("fetch", "firecrawl"),
        ("fetch", "firecrawl"),
        ("discover", "exa"),
    ]:
        audit.record({"op": op, "provider": provider, "status": "ok"})
    s = audit.summary()
    assert s["event_count"] == 3
    assert s["by_op"] == {"fetch": 2, "discover": 1}
    assert s["by_provider"] == {"firecrawl": 2, "exa": 1}
    assert s["by_status"] == {"ok": 3}


def test_parse_since_accepts_units():
    assert audit.parse_since("1m")
    assert audit.parse_since("2h")
    assert audit.parse_since("7d")
    with pytest.raises(ValueError):
        audit.parse_since("5x")


# Concurrency: spawn two processes, write 50 receipts each, expect 100 well-formed lines.

def _writer_worker(path_env: str, label: str, n: int):
    os.environ["WSC_STATE_DIR"] = path_env
    # Re-import so child process picks up the new env.
    from importlib import reload

    from wsc import audit as child_audit  # noqa: F401

    reload(child_audit)
    for i in range(n):
        child_audit.record({"op": "fetch", "provider": "firecrawl", "call_id": f"{label}-{i}"})


@pytest.mark.skipif(sys.platform == "win32", reason="fcntl-only locking")
def test_concurrent_writes_do_not_tear(tmp_path, monkeypatch):
    state_dir = tmp_path / "state"
    monkeypatch.setenv("WSC_STATE_DIR", str(state_dir))
    ctx = multiprocessing.get_context("spawn")
    procs = [
        ctx.Process(target=_writer_worker, args=(str(state_dir), "A", 50)),
        ctx.Process(target=_writer_worker, args=(str(state_dir), "B", 50)),
    ]
    for p in procs:
        p.start()
    for p in procs:
        p.join(timeout=30)
        assert p.exitcode == 0, f"writer exited with {p.exitcode}"

    raw = (state_dir / "audit.jsonl").read_text(encoding="utf-8").splitlines()
    assert len(raw) == 100
    parsed = [json.loads(line) for line in raw]
    ids = {ev["call_id"] for ev in parsed}
    assert len(ids) == 100
