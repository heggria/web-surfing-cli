---
name: web-surfing-cli
description: Use the local wsc CLI (web-surfing-cli) for any task that needs to read information from the public web — official library docs, semantic discovery of similar projects/papers/companies, current web facts, or fetching/crawling a known URL. Hard-codes a routing policy across Context7, Exa, Tavily, Firecrawl, Brave, and DuckDuckGo so you stop fighting over which search tool to use.
---

# wsc — web-surfing-cli

Use this skill **whenever the task requires fetching information from the public web** — for example: looking up an official library API, discovering similar projects/papers/competitors, checking current news/pricing/release notes, or pulling clean markdown out of a known URL.

The CLI is `wsc`. It is a thin wrapper around five providers wired into a single routing policy with audit receipts. Prefer `wsc` over hand-rolled `curl`, `requests`, or directly invoking individual MCPs (Context7 / Exa / Tavily / Firecrawl / Brave) — the routing policy and budget gates only apply when going through `wsc`.

## First Rule

If `wsc` is not on PATH, **stop and run `/web-install`** instead of calling raw HTTP. The CLI installs once via pipx; the plugin alone cannot ship a Python binary.

```bash
command -v wsc || echo "missing — run /web-install"
```

If installed, you can also invoke it by absolute path: `~/.local/bin/wsc`.

## Routing Policy (locked-in — do not improvise)

| User intent                                   | Subcommand        | Primary provider | Fallback chain                                  |
|-----------------------------------------------|-------------------|------------------|-------------------------------------------------|
| Official docs of a library / framework / API  | `wsc docs`        | Context7         | Firecrawl GitHub README → urllib raw README     |
| Find similar projects / papers / companies / people | `wsc discover` | Exa              | Tavily (re-prompted) → Brave → DuckDuckGo HTML  |
| Current web facts / news / pricing / release notes  | `wsc search`   | Tavily           | Brave → DuckDuckGo HTML                         |
| Clean a known URL into markdown               | `wsc fetch`       | Firecrawl        | stdlib urllib + html.parser (degraded)          |
| Crawl a site or section                       | `wsc crawl`       | Firecrawl        | (no fallback — fail loud)                       |
| Not sure which lane → ask wsc to route        | `wsc plan <q>`    | (rule router)    | dispatches to one of the above                  |

When uncertain, run `wsc plan "<query>" --explain` first — it prints the routing decision and the candidate `would_run` command without spending API credits.

## Budgets and Kill-Switches

- `crawl` requires `--apply` for 11–100 pages and `--apply --i-know-this-burns-credits` for >100. Single-page `fetch` is free.
- Per-provider daily caps live in `~/.config/wsc/budget.toml`. `wsc receipts summary` shows utilization.
- Emergency kill-switch: `wsc config disable <provider>`. Reverse with `wsc config enable <provider>`.

## Reading the Output

Every subcommand returns a JSON envelope when stdout is not a TTY (so you always get JSON when invoking from a tool/hook). Look for these top-level keys:

- `ok` — true/false. Always check this first.
- `provider` — which provider actually answered. **If it is not the primary for that subcommand, the result is degraded** — see `fallback_chain` for why.
- `fallback_chain` — list of `{from, reason, error?}` steps. A non-empty chain means the primary failed (`missing_key`, `disabled`, `rate_limit`, `auth_error`, `transport_error`, `provider_error`).
- `status` — `ok` | `degraded` | `error`. Treat `degraded` results as best-effort; the user should know they're not first-class data.
- `results` (for search/discover) or `page` (for fetch/docs) or `pages` (for crawl).

## Audit (receipts)

Every call writes one JSON line to `~/.local/state/wsc/audit.jsonl` with:

- `call_id`, `parent_call_id`, `correlation_id` (from `WSC_CORRELATION_ID` env)
- `op`, `provider`, `fallback_chain`
- `query_hash` + `query_preview` (no full query plaintext; redaction by design)
- `selected_urls` (with secret query params stripped)
- `results_count`, `selected_count`, `duration_ms`
- `route_decision` (for `plan` only) — full classifier output incl. confidence + ambiguous

Read recent activity:

```bash
wsc receipts tail --lines 20 --json
wsc receipts summary --days 7 --by-domain --cost
wsc receipts tail --tool fetch --since 1h
```

## Common Recipes

```bash
# Library docs (free; Context7 has a free tier)
wsc docs react --topic hooks
wsc docs next.js --topic "app router middleware"

# Find alternatives / similar work
wsc discover "alternatives to firecrawl"
wsc discover "research papers on speculative decoding" --type paper --since 90

# Pull a single page into clean markdown
wsc fetch https://docs.anthropic.com/claude/docs/extended-thinking

# Crawl a docs site (gated)
wsc crawl https://docs.firecrawl.dev --max-pages 30 --apply

# Current state / news
wsc search "claude 4.7 latest features" --time week
wsc search "supabase pricing"

# Auto-route — useful when the query intent is ambiguous
wsc plan "react useState vs useReducer performance" --explain
wsc plan "https://example.com/blog"

# Kill switch (key leaked, runaway loop)
wsc config disable firecrawl
wsc config enable firecrawl

# What did I burn today?
wsc receipts summary --days 1 --cost
```

## When wsc Is Not Enough

If the task truly needs an action wsc can't perform (e.g., authenticated API calls, scripted browser automation, internal MCP sources), say so and ask before reaching for raw HTTP. Do not silently bypass the routing policy — the value of this skill is that **every web call is auditable and budgeted**.

If the missing operation looks broadly useful, propose adding it to `wsc/ops/*.py` rather than working around the CLI in shell glue.

## Troubleshooting

- `MissingKeyError` for a provider → expected when no key configured; the chain will fall through. Tell the user which env var to set (e.g. `EXA_API_KEY`, `TAVILY_API_KEY`, `FIRECRAWL_API_KEY`).
- `RateLimitError` (429) → fallback already kicked in; check `fallback_chain`. If the user wants to wait and retry, mention `Retry-After` is captured in the receipt.
- `TransportError` (DNS / SSL / timeout) → likely network. Retry once before declaring failure.
- `disabled` reason in fallback_chain → user explicitly disabled; suggest `wsc config enable <provider>` only if they meant to.
