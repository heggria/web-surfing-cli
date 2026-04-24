---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: Comprehensive briefing macro — search + fetch top results + format with sha256-stamped <evidence> blocks ready to paste into a writeup. Use when the user wants "tell me everything about X" in one round trip.
argument-hint: <query> [--depth shallow|standard|deep] [--time week|month] [--source hn|reddit|...]
---

`wsc deepdive` is the macro that replaces "search → pick top K → fetch each → stitch markdown" with one command. The output is a markdown bundle where every source has an `<evidence url="..." sha256="..." fetched_at="..." />` tag inline, so the writeup is verifiable by construction.

**Precondition:** verify `wsc` is on PATH. If not, run `/web-install` and stop.

```bash
command -v wsc >/dev/null 2>&1 || { echo "wsc not installed; run /web-install"; exit 64; }
```

**Run:**

```bash
wsc deepdive $ARGUMENTS
```

`$ARGUMENTS` is the topic plus optional flags:
- `--depth shallow|standard|deep` — default `standard`
- `--time day|week|month|year` — restrict search to recent results
- `--include-domain <d>` (repeatable) — restrict search to this domain
- `--source hn|reddit|x|gh|so|arxiv` (or `hn+reddit`) — preset domain shortcut

**Depth presets:**

| depth    | search top | corroborate | fetch | excerpt size | when to use |
|----------|------------|-------------|-------|--------------|-------------|
| shallow  | 3          | off         | 3     | 1000 chars   | scoping; "what is X"; first-pass |
| standard | 5          | 2 providers | 5     | 1500 chars   | default; most briefing tasks |
| deep     | 5          | 3 providers | 5     | 2500 chars   | high-stakes; reports the user will publish |

Cost scales with depth: standard ≈ 2 search + 5 fetch credits; deep ≈ 3 search + 5 fetch. The fetch cache makes repeats free within an hour.

**Examples:**

- `wsc deepdive "claude opus 4.7 release notes" --depth standard --time week`
- `wsc deepdive "managed agents anthropic 2026" --depth deep`
- `wsc deepdive "claude code subagents" --source hn+reddit --depth standard`

**Reading the output:**

Default human mode prints the markdown directly — copy/paste it into your writeup. JSON mode (`wsc --json deepdive ...`) returns:
- `markdown` — the formatted bundle (same as human mode)
- `evidence: [{url, sha256, fetched_at, status, provider, title, snippet, excerpt, corroborated_by}]` — structured per-source data
- `counts: {ok, degraded, error, total}` — quick health
- `search.multi_source_evidence` — if depth ≥ standard, providers that participated in the corroboration

**Writeup discipline:**

The `<evidence ...>` tags ARE the citation. When using deepdive output in a report:
1. Keep the `<evidence>` tag inline — readers can verify the sha256 themselves
2. Mark URLs with `corroborated_by="..."` as high-confidence (multiple providers returned them)
3. Mark URLs with `status="degraded"` as best-effort (Firecrawl was unavailable)
4. Skip URLs with `status="error"` — the fetch failed and the snippet is unverified

If you only need proof for a known set of URLs (not the full briefing), use `/web-verify` instead.