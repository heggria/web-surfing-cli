---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: Semantic discovery via Exa — find similar projects, alternatives, research papers, companies, or people. Use when the user wants to "find me X like Y" or "what are alternatives to Z".
argument-hint: <query> [--type code|paper|company|people] [--since N]
---

Use Exa-led semantic discovery. Falls back to Tavily/Brave/DuckDuckGo (with the query reframed to suit keyword engines) if Exa is unavailable.

**Precondition:** verify `wsc` is on PATH. If not, run `/web-install` and stop.

```bash
command -v wsc >/dev/null 2>&1 || { echo "wsc not installed; run /web-install"; exit 64; }
```

**Run:**

```bash
wsc --json discover $ARGUMENTS
```

`$ARGUMENTS` is the discovery query plus optional flags:
- `--type code|paper|company|people` — narrows the kind of result (Exa categories)
- `--since N` — restrict to the last N days
- `--num-results N` — default 10

Examples:
- `wsc discover "alternatives to firecrawl"`
- `wsc discover "speculative decoding" --type paper --since 90`
- `wsc discover "vector database vendors" --type company --num-results 15`

**Reading the output:**

- `ok: true`, `provider: "exa"`, `status: "ok"` → present 3–5 best `results[]` with title, snippet, URL, and source_kind (`paper`/`code`/`company`/`web`).
- `provider: "tavily"|"brave"|"duckduckgo"`, `status: "degraded"` → primary failed; results are still useful but ranked by keyword relevance, not semantic. Mention which provider answered.
- Empty `results[]` with `ok: true` → no hits; suggest reframing or relaxing `--since`.
