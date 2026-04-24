---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: Auto-route a web research query through the wsc CLI (docs / discover / search / fetch). Uses wsc's rule router; falls back across providers and writes a receipt to ~/.local/state/wsc/audit.jsonl.
argument-hint: <query>
---

Use the `wsc` CLI to research the user's query. The CLI's rule router decides which provider to call (Context7 for library docs, Exa for semantic discovery, Tavily for web facts, Firecrawl for known URLs) and falls back across providers automatically.

**Precondition:** verify `wsc` is on PATH. If not, run `/web-install` and stop.

```bash
command -v wsc >/dev/null 2>&1 || { echo "wsc not installed; run /web-install"; exit 64; }
```

**Steps:**

1. Run the routing decision first to make the choice visible to the user:
   ```bash
   wsc --json plan "$ARGUMENTS" --explain
   ```
   This costs nothing — it just classifies and prints `recommended_op`, `confidence`, `rules_fired`, and the `would_run` command.

2. If the decision looks correct, execute it:
   ```bash
   wsc --json plan "$ARGUMENTS"
   ```
   This dispatches to the recommended op (`docs`/`discover`/`fetch`/`crawl`/`search`) and writes both a top-level `plan` receipt and the dispatched op's receipt.

3. Read the JSON envelope:
   - `ok: false` → report the error and the `fallback_chain`.
   - `result.status: "degraded"` → say so explicitly; do not present degraded results as first-class.
   - For `discover`/`search`: present 3–5 most relevant `results[]` with title + snippet + URL.
   - For `docs`/`fetch`: present the page title and a short summary of `page.markdown` (not the full text unless the user asked).
   - Always include the active `provider` and any non-empty `fallback_chain` so the user knows which lane was actually used.

If the user wants a different lane than what was recommended, switch to the explicit subcommand: `/web-docs`, `/web-discover`, `/web-fetch`, or call `wsc search ...` / `wsc fetch ...` directly.
