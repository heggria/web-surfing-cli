"""wsc command-line entry point.

Layout philosophy mirrors hsctl: argparse subparsers, ``--json`` opt-in (with
auto-on for non-TTY stdout), every subcommand returns a dict with at least
``ok`` / ``operation`` / ``returncode`` so downstream agents can branch on a
stable schema.
"""

from __future__ import annotations

import argparse
import json
import os
import shlex
import sys
from typing import Any, Dict, List, Optional

from wsc import __version__
from wsc import audit, config, routing


# --- Global flag handling -------------------------------------------------


def _resolve_json(args: argparse.Namespace) -> bool:
    if getattr(args, "json", False):
        return True
    if os.environ.get("WSC_JSON") == "1":
        return True
    try:
        return not sys.stdout.isatty()
    except (AttributeError, ValueError):
        return False


def _emit(args: argparse.Namespace, payload: Dict[str, Any]) -> int:
    if _resolve_json(args):
        print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        _render_human(payload)
    return int(payload.get("returncode", 0))


def _render_human(payload: Dict[str, Any]) -> None:
    op = payload.get("operation", "")
    if payload.get("error") and not payload.get("ok"):
        print(payload["error"], file=sys.stderr)
    if op == "init":
        for action in payload.get("actions", []):
            print(action)
        if not payload.get("actions"):
            print("(nothing to do)")
        return
    if op == "config.doctor":
        _render_doctor(payload)
        return
    if op == "config.disable":
        print(payload.get("message", ""))
        return
    if op == "config.enable":
        print(payload.get("message", ""))
        return
    if op == "receipts.tail":
        events = payload.get("events", []) or []
        if not events:
            print("(no audit events)")
        for ev in events:
            ts = ev.get("ts", "?")
            ev_op = ev.get("op", "?")
            provider = ev.get("provider") or "-"
            status = ev.get("status", "?")
            dur = ev.get("duration_ms", "?")
            print(f"{ts}  {ev_op:14s}  {provider:11s}  {status:9s}  {dur}ms  call={ev.get('call_id', '')[:8]}")
        return
    if op == "receipts.summary":
        _render_receipts_summary(payload)
        return
    if op == "plan.explain":
        _render_plan_explain(payload)
        return
    # Fallback: dump JSON if we don't have a nicer renderer.
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))


def _render_doctor(payload: Dict[str, Any]) -> None:
    rows = payload.get("providers", [])
    print(f"{'PROVIDER':12s} {'ROLE':22s} {'STATUS':10s} KEY?  ENV")
    print("-" * 78)
    for r in rows:
        env_keys = ",".join(r.get("env_keys", []) or []) or "-"
        print(
            f"{r['provider']:12s} {str(r['role']):22s} {r['status']:10s} "
            f"{'yes' if r['has_key'] else 'no ':4s}  {env_keys}"
        )
    chains = payload.get("role_fallback_chains", {}) or {}
    if chains:
        print("\nlive fallback chains:")
        for role, chain in chains.items():
            print(f"  {role:22s} → {' → '.join(chain) if chain else '(none available)'}")
    if not payload.get("ok"):
        print(f"\nhint: {payload.get('hint', '')}", file=sys.stderr)


def _render_receipts_summary(payload: Dict[str, Any]) -> None:
    print(
        f"summary  scope={payload.get('scope', 'all')}  events={payload.get('event_count', 0)}"
    )
    for label, key in (
        ("by op", "by_op"),
        ("by provider", "by_provider"),
        ("by status", "by_status"),
    ):
        d = payload.get(key) or {}
        if d:
            print(f"  {label}:")
            for k, v in sorted(d.items(), key=lambda kv: -kv[1]):
                print(f"    {v:5d}  {k}")
    if "cost_units_total" in payload:
        print(f"  cost: {payload['cost_units_total']} units, ~${payload['cost_usd_estimated_total']}")
    by_domain = payload.get("by_domain") or {}
    if by_domain:
        print("  top domains:")
        for host, n in by_domain.items():
            print(f"    {n:5d}  {host}")
    high = payload.get("high_confidence_events") or []
    if high:
        print(f"  high-confidence events: {len(high)}")


def _render_plan_explain(payload: Dict[str, Any]) -> None:
    d = payload.get("decision") or {}
    print(f"query: {payload.get('query')!r}")
    print(f"intent:        {d.get('intent')}")
    print(f"recommend op:  {d.get('recommended_op')}  → provider {d.get('recommended_provider')}")
    print(f"confidence:    {d.get('confidence')}  (ambiguous={d.get('ambiguous')})")
    print(f"rationale:     {d.get('rationale')}")
    print(f"search budget: {d.get('search_budget')}")
    fired = d.get("rules_fired") or []
    if fired:
        print("rules fired:")
        for line in fired:
            print(f"  - {line}")
    why = d.get("why_not") or []
    if why:
        print("why_not:")
        for w in why:
            print(f"  - {w.get('op')}: {w.get('reason')}")
    print(f"\nwould run: {payload.get('would_run')}")


# --- Parser ---------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="wsc",
        description=(
            "Unified evidence-acquisition CLI across Context7, Exa, Tavily, "
            "Firecrawl, Brave, and DuckDuckGo."
        ),
    )
    p.add_argument("--version", action="version", version=f"wsc {__version__}")
    p.add_argument("--json", action="store_true", help="emit JSON (auto-on if stdout is not a TTY)")
    p.add_argument("--quiet", action="store_true")
    p.add_argument("--no-receipt", action="store_true", help="skip audit log write")
    p.add_argument("--budget", type=int, default=None, help="override per-task search budget")

    sub = p.add_subparsers(dest="command")

    # init
    init_p = sub.add_parser("init", help="create config + state dirs and templates")
    init_p.add_argument("--force", action="store_true", help="overwrite existing keys.ini / budget.ini")
    init_p.add_argument("--yes", action="store_true", help="non-interactive (no prompts; v0.1 always non-interactive)")

    # config
    cfg = sub.add_parser("config", help="provider availability and kill-switch")
    cfg_sub = cfg.add_subparsers(dest="config_command", required=True)
    doctor_p = cfg_sub.add_parser("doctor", help="show per-provider status and live fallback chains")
    doctor_p.add_argument("--deep", action="store_true", help="run minimal real probe per provider (M2)")
    disable_p = cfg_sub.add_parser("disable", help="kill-switch a provider until re-enabled")
    disable_p.add_argument("provider", choices=sorted(config.PROVIDERS.keys()))
    enable_p = cfg_sub.add_parser("enable", help="reverse `wsc config disable`")
    enable_p.add_argument("provider", choices=sorted(config.PROVIDERS.keys()))

    # receipts
    rec = sub.add_parser("receipts", help="audit log")
    rec_sub = rec.add_subparsers(dest="receipts_command", required=True)
    tail_p = rec_sub.add_parser("tail", help="last N receipts")
    tail_p.add_argument("--lines", type=int, default=20)
    tail_p.add_argument("--tool", default=None, help="filter by op prefix (e.g. fetch, plan)")
    tail_p.add_argument("--provider", default=None)
    tail_p.add_argument("--since", default=None, help="duration like 15m, 2h, 7d")
    sum_p = rec_sub.add_parser("summary")
    sum_p.add_argument("--days", type=int, default=0)
    sum_p.add_argument("--by-domain", dest="by_domain", action="store_true")
    sum_p.add_argument("--cost", action="store_true")
    sum_p.add_argument("--high-confidence", dest="high_confidence", action="store_true")

    # plan (M1: --explain only; M2 wires real execution)
    plan_p = sub.add_parser("plan", help="auto-route a query to the right tool")
    plan_p.add_argument("query")
    plan_p.add_argument("--explain", action="store_true", help="show route decision without calling providers (M1)")
    plan_p.add_argument("--prefer", choices=["fast", "deep"], default=None)
    plan_p.add_argument("--router", choices=["rule", "llm"], default="rule")

    # M2 placeholders so help+autocomplete include them.
    for name, help_text in (
        ("docs", "fetch official library docs via Context7 (M2)"),
        ("discover", "semantic discovery via Exa (M2)"),
        ("fetch", "clean a known URL via Firecrawl (M2)"),
        ("crawl", "crawl a site via Firecrawl (M2)"),
        ("search", "general web search via Tavily (M2)"),
    ):
        sub.add_parser(name, help=help_text)

    return p


# --- Subcommand dispatch --------------------------------------------------


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 0

    try:
        if args.command == "init":
            return _emit(args, config.init(force=args.force))
        if args.command == "config":
            return _emit(args, _dispatch_config(args))
        if args.command == "receipts":
            return _emit(args, _dispatch_receipts(args))
        if args.command == "plan":
            return _emit(args, _dispatch_plan(args))
        # M2 placeholders.
        if args.command in {"docs", "discover", "fetch", "crawl", "search"}:
            return _emit(
                args,
                {
                    "ok": False,
                    "operation": args.command,
                    "error": f"`wsc {args.command}` requires M2 providers (planned next milestone)",
                    "returncode": 64,
                },
            )
    except Exception as exc:  # noqa: BLE001
        return _emit(
            args,
            {
                "ok": False,
                "operation": args.command,
                "error": f"{type(exc).__name__}: {exc}",
                "returncode": 1,
            },
        )

    return _emit(
        args,
        {"ok": False, "operation": args.command, "error": "unsupported command", "returncode": 2},
    )


def _dispatch_config(args: argparse.Namespace) -> Dict[str, Any]:
    if args.config_command == "doctor":
        return config.doctor(deep=args.deep)
    if args.config_command == "disable":
        config.disable(args.provider)
        return {
            "ok": True,
            "operation": "config.disable",
            "provider": args.provider,
            "message": f"disabled {args.provider} (run `wsc config enable {args.provider}` to undo)",
            "returncode": 0,
        }
    if args.config_command == "enable":
        was_disabled = config.enable(args.provider)
        return {
            "ok": True,
            "operation": "config.enable",
            "provider": args.provider,
            "message": (
                f"re-enabled {args.provider}" if was_disabled else f"{args.provider} was not disabled"
            ),
            "returncode": 0,
        }
    return {"ok": False, "operation": "config", "error": "unknown subcommand", "returncode": 2}


def _dispatch_receipts(args: argparse.Namespace) -> Dict[str, Any]:
    if args.receipts_command == "tail":
        return audit.tail(
            lines=args.lines,
            op=args.tool,
            provider=args.provider,
            since=args.since,
        )
    if args.receipts_command == "summary":
        return audit.summary(
            days=args.days,
            by_domain=args.by_domain,
            cost=args.cost,
            high_confidence=args.high_confidence,
        )
    return {
        "ok": False,
        "operation": "receipts",
        "error": "unknown subcommand",
        "returncode": 2,
    }


def _dispatch_plan(args: argparse.Namespace) -> Dict[str, Any]:
    router = routing.get_router(args.router)
    decision = router.classify(
        args.query,
        context={"prefer": args.prefer, "budget_override": args.budget},
    )
    if args.explain:
        return {
            "ok": True,
            "operation": "plan.explain",
            "query": args.query,
            "decision": decision.to_dict(),
            "would_run": f"wsc {decision.recommended_op} {shlex.quote(args.query)}",
            "returncode": 0,
        }
    return {
        "ok": False,
        "operation": "plan",
        "error": "plan execution requires M2 providers; use --explain in M1",
        "decision": decision.to_dict(),
        "returncode": 64,
    }


def entrypoint() -> None:
    sys.exit(main())


if __name__ == "__main__":
    entrypoint()
