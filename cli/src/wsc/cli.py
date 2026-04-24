"""wsc command-line entry point.

M0 ships a minimal skeleton so `pipx install` works and `wsc --version` /
`wsc --help` resolve. M1 fills in subcommands (init / config / receipts /
docs / discover / fetch / crawl / search / plan).
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import List, Optional

from wsc import __version__


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="wsc",
        description=(
            "Unified evidence-acquisition CLI across Context7, Exa, Tavily, "
            "Firecrawl, Brave, and DuckDuckGo."
        ),
    )
    parser.add_argument("--version", action="version", version=f"wsc {__version__}")
    parser.add_argument(
        "--json",
        action="store_true",
        help="emit machine-readable JSON (auto-on when stdout is not a TTY or WSC_JSON=1)",
    )
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--no-receipt", action="store_true", help="skip audit log write")

    sub = parser.add_subparsers(dest="command")

    # M0 placeholder so `wsc --help` lists what's coming.
    for name, help_text in (
        ("init", "create config + state dirs (M1)"),
        ("config", "doctor / disable / enable providers (M1)"),
        ("docs", "fetch official library docs via Context7 (M2)"),
        ("discover", "semantic discovery via Exa (M2)"),
        ("fetch", "clean a known URL via Firecrawl (M2)"),
        ("crawl", "crawl a site via Firecrawl (M2)"),
        ("search", "general web search via Tavily (M2)"),
        ("plan", "auto-route + budget + receipts (M2)"),
        ("receipts", "tail / summarize the audit log (M1)"),
    ):
        sub.add_parser(name, help=help_text)

    return parser


def entrypoint() -> None:
    sys.exit(main())


def main(argv: Optional[List[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)

    if args.command is None:
        parser.print_help()
        return 0

    payload = {
        "ok": False,
        "operation": args.command,
        "error": f"`wsc {args.command}` is scaffolded but not implemented yet (v0.1 alpha)",
        "returncode": 64,
    }
    print(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True))
    return payload["returncode"]


if __name__ == "__main__":
    entrypoint()
