---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: General web search via Tavily (with Brave/DDG fallback). Use for current facts, news, pricing, release notes. Add --corroborate N for cross-validated, high-confidence results.
argument-hint: <query> [--time day|week|month|year] [--country US] [--max-results N] [--corroborate N]
---

General web search. Tavily is primary; Brave and DuckDuckGo (HTML scrape, degraded) cover fallback.

**Precondition:** verify `wsc` is on PATH. If not, run `/web-install` and stop.

```bash
command -v wsc >/dev/null 2>&1 || { echo "wsc not installed; run /web-install"; exit 64; }
```

**Run:**

```bash
wsc --json search $ARGUMENTS
```

`$ARGUMENTS` is the query plus optional flags:
- `--time day|week|month|year` — restricts to recent results (Tavily `days`, Brave `freshness`)
- `--country US` — geo bias
- `--max-results N` — default 10
- `--corroborate N` — fan out to N providers in parallel, dedupe by URL, mark URLs returned by multiple providers (M1 of v0.3). Costs N× a single call; use only when cross-validation matters.

**When to use search vs discover:**
- `search` — current facts, news, pricing, "what changed", time-sensitive
- `/web-discover` — semantic neighbors, "alternatives to X", research papers, communities

**When to add `--corroborate 3`:**
- Version numbers (e.g. "what's the latest claude opus version") — must be cross-validated
- Pricing / release dates / benchmark numbers — costly to be wrong
- Security claims / advisories — confidence matters
- "What people are saying about X" — explicit cross-source intent

**When NOT to add `--corroborate`:**
- Browsing / scoping queries
- Single-domain lookups (`--source` filter is better)
- When `--time day|week` already narrows enough

Examples:
- `wsc search "claude opus 4.7 release notes" --time week`
- `wsc search "supabase pricing 2026"` — if you'll cite this in a writeup, add `--corroborate 3`
- `wsc search "managed agents anthropic" --time month --max-results 5 --corroborate 3` — high-confidence

**Reading the output:**

- `ok: true`, `provider: "tavily"`, `status: "ok"` → present 3–5 best `results[]` with title + snippet + URL.
- `provider: "brave"|"duckduckgo"`, `status: "degraded"` → primary failed; mention which provider answered.
- Empty `results[]` with `ok: true` → no hits; suggest broadening the query or removing `--time` / `--country`.

**Reading corroborate output (--corroborate ≥ 2):**
- `multi_source_evidence: [{provider, score}, ...]` length ≥2 → cross-validated.
- `multi_source_evidence` length = 1 with `status: "degraded"` → fan-out collapsed to one survivor.
- Each result's `corroborated_by: [...]` lists additional providers that returned that URL. URLs with non-empty `corroborated_by` are the strongest signals — quote them first.

**Citation discipline:** the URL in a `wsc search` result is a *snippet from the provider*, not a fetched page. Before citing it in a writeup, run `wsc fetch <url>` (or wait for `wsc verify` in M2) to actually pull the content.
