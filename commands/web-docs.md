---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: Look up official library docs via Context7 (with Firecrawl GitHub README fallback). Use this when the user asks "how does <library> do X" or wants the canonical API for a known framework.
argument-hint: <library> [--topic <topic>] [--version <ver>]
---

Look up official docs for a library using the wsc CLI. Context7 is the primary provider (free tier works without a key); falls back to scraping the library's GitHub README if Context7 is unavailable.

**Precondition:** verify `wsc` is on PATH. If not, run `/web-install` and stop.

```bash
command -v wsc >/dev/null 2>&1 || { echo "wsc not installed; run /web-install"; exit 64; }
```

**Run:**

```bash
wsc --json docs $ARGUMENTS
```

`$ARGUMENTS` is the library name plus any flags. Examples:
- `wsc docs react --topic hooks`
- `wsc docs next.js --topic "app router middleware"`
- `wsc docs prisma --topic relations`

**Reading the output:**

- `ok: true`, `provider: "context7"`, `status: "ok"` → present `page.title` and a short summary of `page.markdown`. The `library_id` (e.g. `/facebook/react`) is the canonical Context7 path.
- `provider: "firecrawl"`, `status: "degraded"` → Context7 was unavailable; the result is the GitHub README (real docs may have more). Say so.
- `ok: false` with `fallback_chain` listing both context7 and firecrawl reasons → docs aren't reachable; surface the reasons (`missing_key` / `transport_error` / etc.) so the user can act.

If the user is asking something time-sensitive (latest version, what's new, release notes) instead of how-to docs, switch to `/web` (auto-route) or `wsc search ...` — the routing policy reserves `docs` for *how to use* not *what's current*.
