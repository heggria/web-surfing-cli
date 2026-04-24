---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: Verify URLs by fetching each and emitting a sha256 + fetched_at proof receipt. Use BEFORE citing any URL in a writeup. Without verification, the URL came from a search snippet — not from a fetched page.
argument-hint: <url> [moreUrls...] OR --from-receipt <call_id>
---

`wsc verify` actually fetches the URLs and produces a tamper-evident proof: sha256 of the markdown + UTC timestamp. Use this before quoting any URL in a writeup or report. Search snippets are NOT verified content — `wsc verify` is.

**Precondition:** verify `wsc` is on PATH. If not, run `/web-install` and stop.

```bash
command -v wsc >/dev/null 2>&1 || { echo "wsc not installed; run /web-install"; exit 64; }
```

**Verify positional URLs:**

```bash
wsc --json verify URL1 URL2 URL3
```

**Verify everything from a prior search/discover/fetch receipt:**

```bash
# Find the call_id of the search you want to back up
LAST=$(wsc --json receipts tail --tool search --lines 1 | jq -r '.events[0].call_id')
wsc --json verify --from-receipt "$LAST"
```

`--from-receipt` looks up the receipt's `selected_urls` and verifies every one of them — useful when you already searched and now want proof for the writeup.

**When to use vs not:**

- ✅ Before pasting a URL into an analysis, summary, or report
- ✅ When the user asks "what does this page actually say"
- ✅ When the search result snippet is suspicious or partial
- ❌ For exploratory browsing or scoping (search snippets are fine to skim)
- ❌ For URLs you've already fetched recently (the fetch cache makes verify fast on repeat, but it still costs a tiny bit)

**Reading the output:**

- `urls[i].sha256` — 64-char hex. This is the proof. Include it in the writeup as `(sha256: abc123...)` or in `<evidence>` markup.
- `urls[i].fetched_at` — UTC timestamp.
- `urls[i].status: "ok"` → Firecrawl-quality content, you can quote freely.
- `urls[i].status: "degraded"` → fell back to stdlib urllib; quote with caution, mention degradation.
- `urls[i].status: "error"` + `urls[i].error` → URL unreachable; do NOT cite.
- `counts.{ok, degraded, error}` → quick health.

**Citation discipline (the whole point):**

A URL appearing in `wsc search` results is a *snippet*, not a fetched page. The provider may have indexed the page weeks ago, may be summarizing it badly, or may be hallucinating its existence. The only safe path before citing is `wsc verify` (or `wsc fetch`, but `verify` is faster for the cite-check use case).

Receipts from `wsc verify` get `op: "verify"` and contain the same `urls: [{url, sha256, status, ...}]` shape as `batch_fetch`, so `wsc receipts tail --tool verify` gives you a record of every cite-check you've run.