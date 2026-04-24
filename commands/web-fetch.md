---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: Pull a single known URL into clean markdown via Firecrawl (with stdlib urllib fallback). Use when the user gives a URL to read or summarize.
argument-hint: <url> [--screenshot] [--format markdown|html]
---

Fetch one URL and clean it into markdown. Firecrawl is the primary; falls back to a stdlib `urllib + html.parser` extractor that handles only static HTML (no JS rendering, no PDF) and is marked degraded.

**Precondition:** verify `wsc` is on PATH. If not, run `/web-install` and stop.

```bash
command -v wsc >/dev/null 2>&1 || { echo "wsc not installed; run /web-install"; exit 64; }
```

**Run:**

```bash
wsc --json fetch $ARGUMENTS
```

Examples:
- `wsc fetch https://docs.anthropic.com/claude/docs/extended-thinking`
- `wsc fetch https://example.com/blog --format markdown`
- `wsc fetch https://example.com/page --screenshot`

**Reading the output:**

- `ok: true`, `provider: "firecrawl"`, `status: "ok"` → use `page.markdown` and `page.title`. `page.metadata` contains `sourceURL`, language, etc.
- `provider: "urllib"`, `status: "degraded"` → Firecrawl was unavailable; the markdown is a poor man's HTML-strip (clamped to 50KB, no main-content extraction). Tell the user.
- `ok: false` → both failed; the `fallback_chain` explains why (`missing_key` for firecrawl + `transport_error` for urllib usually means the page is unreachable).

For multi-page work, use `/web` (auto-route may pick `wsc crawl`) or call `wsc crawl ...` directly with `--apply`.
