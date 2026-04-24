"""Audit log — append-only JSONL receipts at ``~/.local/state/wsc/audit.jsonl``.

Design points (locked in by the plan):

* Each ``record()`` call takes an ``fcntl.flock`` so concurrent ``wsc`` invocations
  never produce torn lines.
* ``start_call()`` is a context manager that allocates ``call_id``, captures
  ``started_at`` / ``duration_ms``, picks up ``WSC_CORRELATION_ID`` from the
  environment, and writes the receipt on exit. Subcommands mutate the dict
  in-place to add op-specific fields (``provider``, ``results_count``, etc.).
* Anything that looks like a secret in URLs is redacted before serialization
  via ``wsc._url.redact_url``. Receipt fields named ``url`` / ``selected_urls``
  / ``rejected[].url`` are walked recursively.
* When the file grows past 50 MiB it rotates to ``audit-YYYYMMDD.jsonl.gz``
  and a new file starts. ``tail`` / ``summary`` only read the active file in
  v0.1 (rotated archives are intentionally out of scope until v0.2).
"""

from __future__ import annotations

import fcntl
import gzip
import io
import json
import os
import shutil
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional

from wsc._url import redact_url

_ROTATE_BYTES = 50 * 1024 * 1024  # 50 MiB


def state_dir() -> Path:
    return Path(os.environ.get("WSC_STATE_DIR", "~/.local/state/wsc")).expanduser()


def audit_path() -> Path:
    return state_dir() / "audit.jsonl"


def utc_iso(ts: Optional[float] = None) -> str:
    if ts is None:
        ts = time.time()
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


def _maybe_rotate(path: Path) -> None:
    if not path.exists():
        return
    try:
        size = path.stat().st_size
    except OSError:
        return
    if size < _ROTATE_BYTES:
        return
    today = datetime.now(timezone.utc).strftime("%Y%m%d")
    rotated = path.parent / f"audit-{today}.jsonl.gz"
    # Append-mode gzip so multiple rotations on the same day concatenate cleanly.
    with path.open("rb") as src, gzip.open(rotated, "ab") as dst:
        shutil.copyfileobj(src, dst, length=1024 * 1024)
    path.unlink()


def _redact_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Redact known URL-bearing fields. Conservative — do not walk arbitrary strings."""

    def walk(value: Any) -> Any:
        if isinstance(value, dict):
            redacted = {}
            for k, v in value.items():
                if k in {"url", "source_url", "next_url"}:
                    redacted[k] = redact_url(v) if isinstance(v, str) else v
                elif k in {"urls", "selected_urls"}:
                    if isinstance(v, list):
                        redacted[k] = [redact_url(u) if isinstance(u, str) else u for u in v]
                    else:
                        redacted[k] = v
                else:
                    redacted[k] = walk(v)
            return redacted
        if isinstance(value, list):
            return [walk(x) for x in value]
        return value

    return walk(event)


def record(event: Dict[str, Any]) -> None:
    """Append a single receipt. Caller is responsible for the receipt schema;
    this function only adds ``ts`` if missing and applies URL redaction."""

    path = audit_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    _maybe_rotate(path)

    payload = dict(event)
    payload.setdefault("ts", utc_iso())
    payload = _redact_event(payload)
    line = json.dumps(payload, ensure_ascii=False, sort_keys=True) + "\n"

    # Open in append mode and lock for the duration of the write so concurrent
    # processes interleave by line, not by byte.
    with path.open("a", encoding="utf-8") as fh:
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX)
        try:
            fh.write(line)
            fh.flush()
            os.fsync(fh.fileno())
        finally:
            fcntl.flock(fh.fileno(), fcntl.LOCK_UN)


@contextmanager
def start_call(
    op: str,
    provider: Optional[str] = None,
    *,
    parent_call_id: Optional[str] = None,
    correlation_id: Optional[str] = None,
    no_receipt: bool = False,
) -> Iterator[Dict[str, Any]]:
    """Allocate a call_id, time the block, and write a receipt on exit.

    The yielded dict is mutated by the caller to add op-specific fields. On
    exit ``ts`` and ``duration_ms`` are filled in; if an exception escapes the
    block, ``status`` is forced to ``"error"`` and ``error`` is populated.
    """

    call_id = str(uuid.uuid4())
    started = time.time()
    receipt: Dict[str, Any] = {
        "call_id": call_id,
        "parent_call_id": parent_call_id,
        "correlation_id": correlation_id or os.environ.get("WSC_CORRELATION_ID"),
        "op": op,
        "provider": provider,
        "started_at": utc_iso(started),
        "status": "ok",
    }
    try:
        yield receipt
    except Exception as exc:  # noqa: BLE001 - we re-raise after recording.
        receipt["status"] = "error"
        receipt.setdefault("error", f"{type(exc).__name__}: {exc}")
        raise
    finally:
        receipt["duration_ms"] = int((time.time() - started) * 1000)
        receipt["ts"] = utc_iso(time.time())
        if not no_receipt:
            try:
                record(receipt)
            except Exception:  # noqa: BLE001 — never mask the real error with audit failure.
                pass


# -- Tail / summary --------------------------------------------------------


_SINCE_UNITS = {"s": 1, "m": 60, "h": 3600, "d": 86400}


def parse_since(spec: str) -> str:
    """Parse e.g. '15m' or '2h' into a UTC ISO cutoff string."""
    spec = spec.strip().lower()
    if not spec:
        raise ValueError("empty --since")
    if spec[-1] not in _SINCE_UNITS:
        raise ValueError(f"unknown --since unit in {spec!r} (use s/m/h/d)")
    try:
        n = float(spec[:-1])
    except ValueError as exc:
        raise ValueError(f"invalid --since value in {spec!r}") from exc
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=int(n * _SINCE_UNITS[spec[-1]]))
    return cutoff.strftime("%Y-%m-%dT%H:%M:%S")


def tail(
    *,
    lines: int = 20,
    op: Optional[str] = None,
    provider: Optional[str] = None,
    since: Optional[str] = None,
) -> Dict[str, Any]:
    path = audit_path()
    if not path.exists():
        return {
            "ok": True,
            "operation": "receipts.tail",
            "events": [],
            "path": str(path),
            "returncode": 0,
        }
    cutoff = parse_since(since) if since else None
    lines_clamped = max(1, min(int(lines or 20), 10000))

    events: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                event = json.loads(raw)
            except ValueError:
                continue
            if op and not str(event.get("op", "")).startswith(op):
                continue
            if provider and event.get("provider") != provider:
                continue
            if cutoff and str(event.get("ts", "")) < cutoff:
                continue
            events.append(event)
    events = events[-lines_clamped:]
    return {
        "ok": True,
        "operation": "receipts.tail",
        "events": events,
        "path": str(path),
        "returncode": 0,
    }


def summary(
    *,
    days: int = 0,
    by_domain: bool = False,
    cost: bool = False,
    high_confidence: bool = False,
) -> Dict[str, Any]:
    from collections import Counter
    from urllib.parse import urlsplit

    path = audit_path()
    out: Dict[str, Any] = {
        "ok": True,
        "operation": "receipts.summary",
        "path": str(path),
        "returncode": 0,
        "event_count": 0,
        "by_op": {},
        "by_provider": {},
        "by_status": {},
        "scope": "all" if days <= 0 else f"last {days}d",
    }
    if not path.exists():
        return out

    cutoff: Optional[str] = None
    if days > 0:
        threshold = datetime.now(timezone.utc) - timedelta(days=days)
        cutoff = threshold.strftime("%Y-%m-%dT%H:%M:%S")

    by_op: Counter = Counter()
    by_provider: Counter = Counter()
    by_status: Counter = Counter()
    by_domain_counter: Counter = Counter()
    cost_units = 0.0
    cost_usd = 0.0
    multi_source: List[Dict[str, Any]] = []

    with path.open("r", encoding="utf-8") as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                event = json.loads(raw)
            except ValueError:
                continue
            if cutoff and str(event.get("ts", "")) < cutoff:
                continue
            out["event_count"] += 1
            by_op[event.get("op", "?")] += 1
            by_provider[event.get("provider") or "?"] += 1
            by_status[event.get("status") or "?"] += 1
            cost_units += float(event.get("cost_units") or 0)
            cost_usd += float(event.get("cost_usd_estimated") or 0)
            if by_domain:
                for u in event.get("selected_urls", []) or []:
                    if isinstance(u, str) and "://" in u:
                        host = urlsplit(u).hostname or "?"
                        by_domain_counter[host] += 1
            if high_confidence:
                ev = event.get("multi_source_evidence") or []
                if isinstance(ev, list) and len(ev) >= 2:
                    multi_source.append(
                        {
                            "call_id": event.get("call_id"),
                            "providers": [e.get("provider") for e in ev],
                            "ts": event.get("ts"),
                        }
                    )

    out["by_op"] = dict(by_op)
    out["by_provider"] = dict(by_provider)
    out["by_status"] = dict(by_status)
    if cost:
        out["cost_units_total"] = round(cost_units, 4)
        out["cost_usd_estimated_total"] = round(cost_usd, 4)
    if by_domain:
        out["by_domain"] = dict(by_domain_counter.most_common(50))
    if high_confidence:
        out["high_confidence_events"] = multi_source
    return out
