# AGENTS.md — wsc (web-surfing-cli)

This file tells any AI coding/research agent how to use `wsc`, the local web-research CLI installed on this machine. It is the agent-agnostic equivalent of the Claude Code `SKILL.md` shipped with this repo, intended for tools that follow the [AGENTS.md convention](https://agents.md) (opencode, codex, aider, Cursor rules, etc.) or any agent that reads project markdown for instructions.

The MCP server (`wsc mcp`) carries the same guidance inside each tool's `description` field — if you're invoking `wsc` via MCP you don't need this file. If you're shelling out to the CLI directly, read this once.

## What `wsc` is

A unified web-research CLI that hard-codes a routing policy across **Context7, Exa, Tavily, Firecrawl, Brave, DuckDuckGo, and Tavily Extract**. One CLI, one audit log, one cache, one set of rules — so you don't burn quota guessing which search tool to invoke.

```
wsc docs <library>                → Context7      (official docs)
wsc discover <query>              → Exa           (semantic / similar / discussions / opinions)
wsc search <query>                → Tavily        (general web facts, news, pricing)
wsc fetch <url> [moreUrls...]     → Firecrawl     (clean a known URL; multi for batch)
wsc verify <url> [moreUrls...]    → fetch chain   (sha256 + fetched_at proof for citations)
wsc deepdive <query>              → search+fetch  (one-shot briefing with <evidence> tags)
wsc crawl <url>                   → Firecrawl     (gated by --apply)
wsc plan <query>                  → auto-route    (rule router; --explain shows decision)
wsc cache stats|clear             → cache mgmt
wsc receipts tail|summary         → audit log
```

Verify it's installed before using:

```bash
command -v wsc >/dev/null 2>&1 || { echo "wsc missing — install with: npm i -g github:heggria/web-surfing-cli"; exit 64; }
```

## Routing policy (locked-in — do not improvise)

| User intent | Subcommand | Notes |
|---|---|---|
| Official docs of a library / framework / API | `wsc docs` | free tier via Context7 |
| Find similar projects / papers / companies / people / discussions / opinions | `wsc discover` | semantic via Exa |
| Current web facts / news / pricing / release notes | `wsc search` | Tavily-led |
| Clean a known URL into markdown | `wsc fetch <url>` | Firecrawl primary |
| Clean MULTIPLE URLs in parallel | `wsc fetch URL1 URL2 ...` | concurrent (default 4) |
| Verify URLs before citing in a writeup | `wsc verify` | sha256 + fetched_at proof |
| Comprehensive briefing on a topic (one round trip) | `wsc deepdive` | search + fetch + `<evidence>` markdown |
| Crawl a site or section | `wsc crawl` | requires `--apply` past 10 pages |
| Not sure which lane → ask wsc to route | `wsc plan <q>` | rule router |

When uncertain, run `wsc plan "<query>" --explain` first — it prints the routing decision and the candidate `would_run` command without spending API credits.

## Citation discipline (the most important rule)

**A URL returned by `wsc search` or `wsc discover` is a PROVIDER SNIPPET, not a fetched page. Do NOT cite it directly in a writeup.**

To cite a URL in a report, summary, or analysis, you must have actually fetched it. Three valid paths in order of preference:

1. **`wsc deepdive <topic>`** — fully orchestrated; emits `<evidence url="..." sha256="..." fetched_at="..." />` blocks ready to paste into the writeup.
2. **`wsc verify URL1 URL2 ...`** — explicit cite-check; produces compact `{url, sha256, fetched_at, status}` receipts.
3. **`wsc verify --from-receipt <call_id>`** — verifies *every* selected_url of a prior search/discover.

A receipt with `verified_urls[i].sha256` matching the URL in your writeup is the proof. A `wsc search` snippet alone is not.

## Cross-validation & confidence

Default `search` / `discover` uses one primary provider. For high-stakes claims add `--corroborate N`:

```bash
wsc search "claude opus 4.7 release date" --time week --corroborate 3
```

This fans out to N providers in parallel, dedupes by URL, and produces:

| Receipt signal | Meaning | Writeup style |
|---|---|---|
| `multi_source_evidence: []` | Single provider, no cross-validation | "according to <provider>, ..." |
| `multi_source_evidence` length ≥ 2 | Multiple providers participated and returned results | Plain factual statement OK |
| Any result with `corroborated_by: ["X", "Y"]` | This URL was returned by 2+ providers | Strongest evidence — quote first |
| `cache_hit: true` | Reusing a recent identical query | Same confidence as when first written |
| `status: "degraded"` (with corroborate) | Fan-out collapsed to one survivor | Treat as single-provider |

When to spend the corroborate cost (N× billing):
- Version numbers, prices, release dates, benchmark numbers
- Security advisories or vulnerability claims
- Anything that would be embarrassing to be wrong about

When NOT to:
- Scoping / browsing queries
- Single-domain lookups (use `--source` instead)

## Cache awareness

Every successful `search` / `discover` / `fetch` / `docs` is content-addressed cached at `~/.cache/wsc/blobs/`. Per-op TTL: search 5min, discover 30min, fetch/docs 1h, crawl never.

- **Don't manually deduplicate.** If the user asks the same question twice, just call `wsc` again — the cache handles it. Don't store wsc results in your own context "to save calls".
- **If freshness matters more than cost** (release announcements, breaking news), pass `--no-cache`.
- **A `cache_hit: true` receipt is not a degraded result** — the original `provider` and `fallback_chain` are preserved from when the entry was first written.

```bash
wsc cache stats                                  # count, size, expired entries
wsc cache clear --expired-only
wsc cache clear --provider tavily                # after key rotation
```

## Output reading

Every subcommand returns a JSON envelope when stdout is not a TTY (auto-on for tool/hook callers). Top-level keys to check:

- `ok` — true/false. Always check first.
- `provider` — which provider actually answered. **If not the primary for that subcommand, the result is degraded** — see `fallback_chain` for why.
- `fallback_chain` — list of `{from, reason, error?}`. A non-empty chain means the primary failed (`missing_key`, `disabled`, `rate_limit`, `auth_error`, `transport_error`).
- `status` — `ok` | `degraded` | `error`. Treat `degraded` as best-effort; tell the user.
- `results` (search/discover) or `page` (fetch/docs) or `pages` (crawl) or `markdown` (deepdive) or `urls` (verify/batch_fetch).
- `cache_hit` — true means free repeat.
- `multi_source_evidence` — only with `--corroborate N`.

## Audit (receipts)

Every call writes one JSON line to `~/.local/state/wsc/audit.jsonl` with `call_id`, `parent_call_id`, `correlation_id`, `op`, `provider`, `fallback_chain`, `query_hash` (no plaintext), redacted `selected_urls`, `verified_urls`, `multi_source_evidence`, `cache_hit`, `cost_units`, `duration_ms`.

```bash
wsc receipts tail --lines 20 --json
wsc receipts summary --days 7 --by-domain --cost
wsc receipts summary --high-confidence            # ≥2 providers in multi_source_evidence
wsc receipts tail --tool fetch --since 1h
```

## Common recipes

```bash
# Library docs (free; Context7 has a free tier)
wsc docs react --topic hooks

# Find alternatives / similar work / community discussion
wsc discover "alternatives to firecrawl"
wsc discover "discussions on managed agents 2026"

# Pull a single page or batch into clean markdown
wsc fetch https://docs.anthropic.com/claude/docs/extended-thinking
wsc fetch https://anthropic.com/news https://docs.anthropic.com/en/release-notes/api

# Current state / news (with optional time filter + cross-validation)
wsc search "claude 4.7 latest features" --time week
wsc search "claude opus 4.7 release date" --time week --corroborate 3

# Targeted source filter
wsc search "claude code subagents" --source hn+reddit --max-results 10
wsc search "vector db comparison" --include-domain news.ycombinator.com --include-domain github.com

# Verify URLs before citing in a writeup
wsc verify https://anthropic.com/news/claude-opus-4-7
wsc verify --from-receipt $(wsc receipts tail --tool search --lines 1 --json | jq -r '.events[0].call_id')

# One-shot briefing with sha256-stamped evidence
wsc deepdive "managed agents anthropic 2026" --depth standard > evidence.md

# Auto-route — useful when intent is ambiguous
wsc plan "react useState vs useReducer performance" --explain

# Kill switch (key leaked, runaway loop)
wsc config disable firecrawl
```

## When wsc is not enough

If the task truly needs an action wsc can't perform (authenticated API calls, scripted browser automation, internal sources), say so and ask before reaching for raw HTTP. Do not silently bypass the routing policy — the value of this tool is that **every web call is auditable, budgeted, and (when relevant) cross-validated**.

## MCP server (preferred for agents that support MCP)

For MCP-aware agents (Claude Code, Claude Desktop, opencode, codex, Cursor, Cline, Continue), prefer connecting `wsc` as an MCP server over shell calls — the model gets typed tools with the routing/citation guidance embedded inline, and you avoid shell escaping bugs.

```bash
# Claude Code
claude mcp add wsc -- wsc mcp

# opencode (~/.config/opencode/config.json mcp section)
{ "mcp": { "wsc": { "type": "local", "command": ["wsc", "mcp"] } } }

# codex (~/.codex/config.toml)
[mcp_servers.wsc]
command = "wsc"
args = ["mcp"]

# Cursor (.cursor/mcp.json or ~/.cursor/mcp.json)
{ "mcpServers": { "wsc": { "command": "wsc", "args": ["mcp"] } } }
```

After adding, the agent gets these tools: `wsc_plan`, `wsc_search`, `wsc_discover`, `wsc_fetch`, `wsc_verify`, `wsc_deepdive`, `wsc_docs`, `wsc_receipts_tail`, `wsc_cache_stats` — each carrying its routing rule, cross-validation guidance, and citation discipline in its description.

---

Source: <https://github.com/heggria/web-surfing-cli>
