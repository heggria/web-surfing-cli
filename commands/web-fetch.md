---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: Pull a known URL (or multiple URLs in batch) into clean markdown via Firecrawl with stdlib urllib fallback. Use when the user gives one or more URLs to read or summarize.
argument-hint: <url> [moreUrls...] [--screenshot] [--format markdown|html] [--concurrency N]
---

Fetch one or more URLs and clean each into markdown. Firecrawl is the primary; falls back to a stdlib `urllib + html.parser` extractor that handles only static HTML (no JS rendering, no PDF) and is marked degraded.

**Precondition:** verify `wsc` is on PATH. If not, run `/web-install` and stop.

```bash
command -v wsc >/dev/null 2>&1 || { echo "wsc not installed; run /web-install"; exit 64; }
```

**Single URL:**

```bash
wsc --json fetch $ARGUMENTS
```

**Batch (multiple URLs in parallel):**

```bash
wsc --json fetch URL1 URL2 URL3 --concurrency 4
```

When 2+ URLs are passed positionally, `wsc` runs them concurrently (default 4 in flight, override with `--concurrency`). The output shape switches to `operation: "batch_fetch"` with a `urls: [{url, sha256, status, provider, duration_ms}]` array. Each child fetch still writes its own per-URL `op:"fetch"` receipt with `parent_call_id` linking back to the batch — so `wsc receipts tail` shows both the aggregate and the per-URL detail.

Examples:
- `wsc fetch https://docs.anthropic.com/claude/docs/extended-thinking`
- `wsc fetch https://example.com/blog --format markdown`
- `wsc fetch https://example.com/page --screenshot`
- `wsc fetch https://anthropic.com/news https://docs.anthropic.com/en/release-notes/api https://changelog.claude.com` — 3 in parallel

**Reading the single-URL output:**

- `ok: true`, `provider: "firecrawl"`, `status: "ok"` → use `page.markdown` and `page.title`. `page.metadata` contains `sourceURL`, language, etc.
- `provider: "urllib"`, `status: "degraded"` → Firecrawl was unavailable; the markdown is a poor man's HTML-strip (clamped to 50KB, no main-content extraction). Tell the user.
- `ok: false` → both failed; the `fallback_chain` explains why.

**Reading the batch output:**

- `urls[i].sha256` → 64-char hex; same content gives same sha. Quote this when citing the page in a writeup.
- `urls[i].status: "degraded"` → that URL fell back to urllib (others may still be ok).
- `urls[i].error` → that URL totally failed; surface the reason. Other URLs in the batch are unaffected.
- `counts.{ok,degraded,error,total}` → quick triage.

If you only need proof (sha256 + fetched_at, no full markdown body), prefer `/web-verify` — it produces compact verifiable receipts for citations.

For multi-page crawl of a site, use `wsc crawl ...` with `--apply` instead of batch fetch.
