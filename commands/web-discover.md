---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: Semantic discovery via Exa — find similar projects, alternatives, research papers, companies, or people. Use when the user wants to "find me X like Y" or "what are alternatives to Z". Add --corroborate N for cross-validated, high-confidence results.
argument-hint: <query> [--type code|paper|company|people] [--since N] [--corroborate N]
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
- `--corroborate N` — fan out to N providers in parallel, dedupe by URL, mark URLs returned by multiple providers (M1 of v0.3). Costs N× a single call; use only when cross-validation matters.

Examples:
- `wsc discover "alternatives to firecrawl"`
- `wsc discover "speculative decoding" --type paper --since 90`
- `wsc discover "vector database vendors" --type company --num-results 15`
- `wsc discover "managed agent runtimes 2026" --corroborate 3` — high-confidence: results that ≥2 providers returned bubble to the top with `corroborated_by: [...]`

**Reading the output:**

- `ok: true`, `provider: "exa"`, `status: "ok"` → present 3–5 best `results[]` with title, snippet, URL, and source_kind (`paper`/`code`/`company`/`web`).
- `provider: "tavily"|"brave"|"duckduckgo"`, `status: "degraded"` → primary failed; results are still useful but ranked by keyword relevance, not semantic. Mention which provider answered.
- Empty `results[]` with `ok: true` → no hits; suggest reframing or relaxing `--since`.

**Reading corroborate output (--corroborate ≥ 2):**
- `multi_source_evidence: [{provider, score}, ...]` length ≥2 → cross-validated. Treat as high-confidence.
- `multi_source_evidence` length = 1 with `status: "degraded"` → fan-out collapsed to one survivor. Same as a single-provider call.
- Each result's `corroborated_by: [...]` lists the additional providers that returned that URL. URLs with non-empty `corroborated_by` are the strongest signals — quote them first.
