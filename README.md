# web-surfing-cli

A unified evidence-acquisition layer for AI agents — one CLI (`wsc`) that hard-codes a routing policy across **Context7, Exa, Tavily, Firecrawl, Brave, and DuckDuckGo** so your agents stop fighting over which search tool to use.

```
wsc docs <library>      → Context7      (official docs)
wsc discover <query>    → Exa           (semantic / similar projects / papers)
wsc search <query>      → Tavily        (general web facts, news)
wsc fetch <url>         → Firecrawl     (clean a known URL)
wsc crawl <url>         → Firecrawl     (crawl a site, gated by --apply)
wsc plan <query>        → auto-route + budget + receipts
wsc receipts tail       → audit log
```

This repo is **two things at once**:

1. A Python CLI in `cli/` installable via `pipx`.
2. A Claude Code plugin marketplace (`.claude-plugin/`, `skills/`, `commands/`) installable via `/plugin install`.

The plugin teaches Claude *when* to call the CLI; the CLI does the actual work. **Both must be installed.**

---

## For Claude Code users — quickstart

### 1. Install the plugin

```
/plugin install web-surfing-cli@github:heggria/web-surfing-cli
```

This installs the routing skill and slash commands (`/web`, `/web-docs`, `/web-discover`, `/web-fetch`, `/web-receipts`, `/web-install`).

### 2. Install the CLI (one command)

```
/web-install
```

Or manually:

```bash
pipx install git+https://github.com/heggria/web-surfing-cli.git#subdirectory=cli
```

### 3. Initialize and configure

```bash
wsc init
$EDITOR ~/.config/wsc/keys.toml      # add provider keys (or skip and use env vars)
wsc config doctor                    # shows what's ready / what needs a key
```

Set keys either in the file above or as env vars (env wins). Context7 is keyless and works out of the box; the rest need their respective keys.

### 4. Use it

```
/web react useState vs useReducer performance
/web-docs next.js --topic middleware
/web-discover alternatives to firecrawl
/web-fetch https://docs.anthropic.com/claude/docs/extended-thinking
/web-receipts
```

---

## For CLI users — quickstart

```bash
pipx install git+https://github.com/heggria/web-surfing-cli.git#subdirectory=cli
wsc init
wsc config doctor
wsc plan "react useState" --explain          # routing decision (no API spend)
wsc docs react --topic hooks                  # Context7 free tier
wsc receipts tail --lines 5                   # see the receipt
```

The CLI is fully usable without Claude Code. See [`cli/README.md`](cli/README.md) for the CLI-only walkthrough.

---

## Why this exists

If you let an agent install the four search MCPs (Context7 / Exa / Tavily / Firecrawl) side by side, what you get is:

- The agent picks the wrong tool depending on phrasing — the same library question goes to Tavily one day and Exa the next.
- Multiple tools fire on the same query, burning quota and producing duplicate evidence.
- There is no audit of *what* was called, *why*, or *what was spent* — so cost-aware governance is impossible.

`wsc` collapses those four tools (plus Brave + DuckDuckGo as fallbacks) into one CLI with:

- **Hard-coded routing policy** — Context7 for docs, Exa for semantic discovery, Tavily for current web facts, Firecrawl for known URLs. The router is rule-based and deterministic; an LLM router lands in v0.2.
- **Budget gates** — `crawl` requires `--apply` past 10 pages and `--apply --i-know-this-burns-credits` past 100. Per-provider daily caps in `~/.config/wsc/budget.toml`.
- **Kill-switch** — `wsc config disable <provider>` is a one-line emergency stop.
- **Audit receipts** — every call writes a JSONL line to `~/.local/state/wsc/audit.jsonl` with `call_id`, `correlation_id`, `route_decision`, `provider`, `fallback_chain`, `query_hash` (no plaintext), redacted `selected_urls`, `duration_ms`, and `cost_units`.
- **Fallback chains** — `discover` falls Exa → Tavily → Brave → DuckDuckGo HTML; `search` falls Tavily → Brave → DuckDuckGo; `fetch` falls Firecrawl → stdlib urllib (degraded). Every degraded result is marked.

The receipt schema is intentionally compatible with the [Hermit](https://github.com/heggria/Hermit) belief/artifact lineage so you can plug the JSONL straight into a downstream evidence store.

---

## Subcommand cheatsheet

```bash
# Setup
wsc init                                       # idempotent
wsc config doctor [--deep]                     # provider status + live fallback chains
wsc config disable <provider>                  # kill-switch
wsc config enable <provider>

# Research
wsc docs <library> [--topic X] [--version Y]
wsc discover <query> [--type code|paper|company|people] [--since N]
wsc fetch <url> [--format markdown|html] [--screenshot]
wsc crawl <url> [--max-pages N] [--apply] [--i-know-this-burns-credits]
wsc search <query> [--time week|month] [--country US]

# Auto-route
wsc plan <query> [--budget N] [--prefer fast|deep] [--explain] [--router rule|llm]

# Audit
wsc receipts tail [--lines N] [--tool TOOL] [--since 1h] [--provider X]
wsc receipts summary [--days N] [--by-domain] [--cost] [--high-confidence]

# Global flags
--json                                         # default off; auto-on when stdout is not a TTY
--quiet
--no-receipt
--budget N                                     # override per-task search budget
```

---

## Hermit integration

Set `WSC_CORRELATION_ID` to a UUID at the start of an agent task; every `wsc` call inside that task will record the same correlation_id, letting downstream stores group receipts into evidence cases.

```bash
export WSC_CORRELATION_ID=$(uuidgen)
wsc plan "approval gating receipts" 
wsc receipts tail --lines 1 | jq '.correlation_id'   # equals the UUID
```

---

## Status

v0.1 alpha. End-to-end tested with Context7 (free tier) and the rule-based router; provider integrations for Exa, Tavily, Firecrawl, and Brave are wired and unit-tested with mocked HTTP. Items reserved for v0.2:

- Content-addressed cache (`~/.cache/wsc/blobs/`) — receipt field `cache_hit` already present.
- Cross-provider semantic dedup with `multi_source_evidence` aggregation.
- LLM-backed router (`--router llm`) — Protocol scaffold present, raises `NotImplementedError` today.
- `wsc config doctor --deep` real probes (currently returns `skipped`).

---

## License

[MIT](LICENSE)
