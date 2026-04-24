"""ops package — one module per CLI subcommand."""

from wsc.ops import crawl, discover, docs, fetch, plan, search

__all__ = ["crawl", "discover", "docs", "fetch", "plan", "search"]
