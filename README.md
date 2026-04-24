# web-surfing-cli

A unified evidence-acquisition layer for AI agents — one CLI (`wsc`) that hard-codes a routing policy across **Context7, Exa, Tavily, Firecrawl, Brave, and DuckDuckGo** so your agents stop fighting over which search tool to use.

```
wsc docs <library>                → Context7      (official docs)
wsc discover <query>              → Exa           (semantic / similar projects / papers / discussions)
wsc search <query>                → Tavily        (general web facts, news)
wsc fetch <url> [moreUrls...]     → Firecrawl     (clean a known URL; pass multiple for batch)
wsc verify <url> [moreUrls...]    → fetch chain   (sha256 + fetched_at proof for citations)
wsc crawl <url>                   → Firecrawl     (crawl a site, gated by --apply)
wsc deepdive <query>              → search+fetch  (one-shot briefing with <evidence> tags)
wsc plan <query>                  → auto-route + budget + receipts
wsc cache stats|clear             → content-addressed response cache management
wsc receipts tail|summary         → audit log
```

This repo is **two things at once**:

1. A TypeScript CLI installable via `npm` or `bun` (`bin: wsc`).
2. A Claude Code plugin marketplace (`.claude-plugin/`, `skills/`, `commands/`) installable via `/plugin install`.

The plugin teaches Claude *when* to call the CLI; the CLI does the actual work. **Both must be installed.**

---

## What's new in v0.4

- **MCP server** (`wsc mcp`) — `wsc` now exposes its 9 ops as MCP tools. Configure once per agent and forget; the model gets typed tools with routing / cross-validation / citation guidance embedded in each tool's description. Supported: Claude Code, Claude Desktop, opencode, codex, Cursor, Cline, Continue, and any other MCP-aware client.
- **AGENTS.md** at repo root — agent-agnostic prose guidance for tools that follow the [agents.md convention](https://agents.md) (opencode, codex, aider, Cursor rules) or any agent reading project markdown for instructions. Mirrors the Claude Code SKILL.md but free of Claude-specific idioms.

See "Connect from any agent (MCP)" below for setup snippets.

## What's new in v0.3

Built in response to a real-world dogfooding session that exposed three weaknesses:

- **Citation hallucination** — agents were citing `wsc search` URLs as if they had read them; many were just snippets from the search index. Fix: `wsc verify` and `wsc deepdive` produce sha256-stamped proofs; SKILL.md teaches the rule "snippets are not citations."
- **Single-provider blind spots** — every call came from one provider with no cross-validation. Fix: `--corroborate N` fans out to N providers in parallel, dedupes by URL, marks corroborated URLs, and writes `multi_source_evidence` to the receipt.
- **Cost waste on repeats** — duplicate near-identical queries each cost a full provider hit. Fix: content-addressed cache (`~/.cache/wsc/blobs/`) with per-op TTL; second identical query is ~1ms and free.

Headline features:

| | what | when to use |
|---|---|---|
| `wsc deepdive` | search → fetch top-K → markdown bundle with inline `<evidence url="..." sha256="..." fetched_at="..." />` tags | comprehensive briefings on a topic; pasteable into a writeup as-is |
| `wsc verify` | fetch URLs → sha256 + fetched_at proof; supports `--from-receipt <call_id>` to verify a prior search's selected_urls | before citing any URL in a writeup |
| `wsc fetch URL1 URL2 ...` | concurrent batch fetch (default 4 in flight) | when you have a list of URLs to read |
| `--corroborate N` (search/discover) | parallel fan-out to N providers; merged + deduped + corroboration-ranked | high-stakes claims (versions, prices, releases) |
| `--source hn|reddit|x|gh|so|arxiv` | preset domain filter (combine with `+`, e.g. `--source hn+reddit`) | one-domain searches |
| `--include-domain <d>` (repeatable) | explicit `include_domains` to Tavily, `site:` to Brave | ad-hoc domain restrictions |
| `wsc cache stats|clear` | inspect / nuke content-addressed cache | after a key rotation, or when freshness matters |
| tavily-extract fallback | `wsc fetch` chain becomes Firecrawl → Tavily Extract → stdlib urllib | better recovery on Cloudflare-protected pages |
| routing: discussions/opinions → discover | "what are people saying about X" routes to Exa instead of Tavily | community sentiment queries land in semantic discovery |

Receipt schema gains: `cache_hit`, `multi_source_evidence: [{provider, score}]`, `verified_urls: [{url, sha256, fetched_at, status}]`, `urls: [...]` for batch ops, `rejected: [{url, reason}]` for dedup losses.

---

## Connect from any agent (MCP)

`wsc mcp` runs `wsc` as an MCP server over stdio JSON-RPC. Any MCP-aware agent can drive the same 9 tools (`wsc_plan`, `wsc_search`, `wsc_discover`, `wsc_fetch`, `wsc_verify`, `wsc_deepdive`, `wsc_docs`, `wsc_receipts_tail`, `wsc_cache_stats`) — each carries the routing rule, cross-validation guidance, and citation discipline in its description, so the model gets the same instructions Claude Code's SKILL.md provides.

**Claude Code:**

```bash
claude mcp add wsc -- wsc mcp
```

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "wsc": { "command": "wsc", "args": ["mcp"] }
  }
}
```

**opencode** (`~/.config/opencode/config.json`):

```json
{
  "mcp": {
    "wsc": { "type": "local", "command": ["wsc", "mcp"] }
  }
}
```

**codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.wsc]
command = "wsc"
args = ["mcp"]
```

**Cursor** (`.cursor/mcp.json` for project, or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "wsc": { "command": "wsc", "args": ["mcp"] }
  }
}
```

**Cline / Continue** (each has its own `mcpServers` config block — same `{ command: "wsc", args: ["mcp"] }` shape).

After adding, ask the agent something like "what's new in claude opus 4.7 — verify before citing" and it will pick `wsc_search` followed by `wsc_verify` (or just `wsc_deepdive`) on its own. The receipt path stays the same: `~/.local/state/wsc/audit.jsonl`.

For agents that don't speak MCP (aider, raw shell agents), point them at `AGENTS.md` in this repo (or copy it into the project root) — the same routing / citation / confidence rules in pure prose.

## For Claude Code users — quickstart

### 1. Install the plugin

```
/plugin marketplace add heggria/web-surfing-cli
/plugin install web-surfing-cli@web-surfing-cli
```

This installs the routing skill and slash commands (`/web`, `/web-docs`, `/web-discover`, `/web-search`, `/web-fetch`, `/web-verify`, `/web-deepdive`, `/web-receipts`, `/web-install`).

### 2. Install the CLI

```
/web-install
```

Or manually (pick one):

```bash
# from GitHub (works today; ships pre-built dist/cli.mjs)
npm i -g github:heggria/web-surfing-cli
# or with bun
bun add -g github:heggria/web-surfing-cli
# or run ad-hoc
bunx web-surfing-cli@latest --version
# or download a single binary (Node-free, ~63 MB)
curl -fsSL https://github.com/heggria/web-surfing-cli/releases/latest/download/wsc-darwin-arm64.tar.gz | tar -xz -C ~/.local/bin
```

### 3. Initialize and configure

```bash
wsc init
$EDITOR ~/.config/wsc/keys.toml      # add provider keys (or skip and use env vars)
wsc config doctor                    # shows what's ready / what needs a key
```

Set keys either in the TOML file above or as env vars (env wins). Context7 is keyless and works out of the box; the rest need their respective keys. The `[tavily]` section feeds both `tavily` (search) and `tavily-extract` (fetch fallback) — no duplicate key needed.

### 4. Use it

```
/web react useState vs useReducer performance
/web-docs next.js --topic middleware
/web-discover alternatives to firecrawl
/web-search supabase pricing 2026 --time week --corroborate 3
/web-fetch https://docs.anthropic.com/claude/docs/extended-thinking
/web-verify https://anthropic.com/news/claude-opus-4-7
/web-deepdive managed agents anthropic 2026 --depth standard
/web-receipts
```

---

## Citation discipline

The most important thing the v0.3 SKILL.md teaches Claude:

> A URL returned by `wsc search` or `wsc discover` is a **provider snippet**, not a fetched page. Do NOT cite it directly in a writeup.

To cite a URL in a report, summary, or analysis, you must have actually fetched it. Three paths in order of preference:

1. **`wsc deepdive <topic>`** — fully orchestrated; emits `<evidence url="..." sha256="..." fetched_at="..." />` blocks ready to paste into the writeup.
2. **`wsc verify URL1 URL2 ...`** — explicit cite-check; produces compact `{url, sha256, fetched_at, status}` receipts.
3. **`wsc verify --from-receipt <call_id>`** — verifies *every* selected_url of a prior search/discover.

A receipt with `verified_urls[i].sha256` matching the URL in your writeup is the proof. A `wsc search` snippet alone is not.

---

## For CLI users — quickstart

```bash
npm i -g github:heggria/web-surfing-cli   # or: bun add -g github:heggria/web-surfing-cli
wsc init
wsc config doctor

# routing decisions are free (no API spend)
wsc plan "react useState" --explain

# basic — single provider per call
wsc docs react --topic hooks
wsc search "supabase pricing"
wsc fetch https://docs.anthropic.com/claude/docs/extended-thinking

# v0.3 — high confidence + provenance
wsc search "claude opus 4.7 release date" --time week --corroborate 3
wsc deepdive "managed agents anthropic 2026" --depth standard > evidence.md
wsc verify --from-receipt $(wsc receipts tail --tool search --lines 1 --json | jq -r '.events[0].call_id')

# v0.3 — domain filter
wsc search "claude code subagents" --source hn+reddit
wsc search "vector db comparison" --include-domain news.ycombinator.com --include-domain github.com

# audit + cache
wsc receipts tail --lines 5
wsc receipts summary --days 7 --by-domain --cost
wsc receipts summary --high-confidence              # ≥2 providers in multi_source_evidence
wsc cache stats
wsc cache clear --expired-only
```

The CLI is fully usable without Claude Code.

---

## Why this exists

If you let an agent install the four search MCPs (Context7 / Exa / Tavily / Firecrawl) side by side, what you get is:

- The agent picks the wrong tool depending on phrasing — the same library question goes to Tavily one day and Exa the next.
- Multiple tools fire on the same query, burning quota and producing duplicate evidence.
- There is no audit of *what* was called, *why*, or *what was spent* — so cost-aware governance is impossible.
- Snippets get cited as if they were verified content (the original v0.2 dogfooding pain point that drove v0.3).

`wsc` collapses those four tools (plus Brave + DuckDuckGo + Tavily Extract as fallbacks) into one CLI with:

- **Hard-coded routing policy** — Context7 for docs, Exa for semantic discovery + discussions, Tavily for current web facts, Firecrawl for known URLs. Rule-based and deterministic; an LLM router lands in v0.4.
- **Cross-validation on demand** — `--corroborate N` runs N providers in parallel and merges by URL with corroboration ranking.
- **Verifiable citations** — `wsc verify` and `wsc deepdive` produce sha256-stamped proofs that downstream readers can spot-check.
- **Budget gates** — `crawl` requires `--apply` past 10 pages and `--apply --i-know-this-burns-credits` past 100. Per-provider daily caps in `~/.config/wsc/budget.toml`.
- **Cache** — content-addressed (`~/.cache/wsc/blobs/`); per-op TTL (5 min search, 30 min discover, 1 h fetch/docs). Receipt records `cache_hit:true` when a request is served from cache.
- **Kill-switch** — `wsc config disable <provider>` is a one-line emergency stop.
- **Audit receipts** — every call writes a JSONL line to `~/.local/state/wsc/audit.jsonl` with `call_id`, `parent_call_id`, `correlation_id`, `route_decision`, `provider`, `fallback_chain`, `query_hash` (no plaintext), redacted `selected_urls`, `multi_source_evidence`, `verified_urls`, `rejected`, `cache_hit`, `duration_ms`, and `cost_units`.
- **Fallback chains** — `discover` falls Exa → Tavily → Brave → DuckDuckGo HTML; `search` falls Tavily → Brave → DuckDuckGo; `fetch` falls Firecrawl → Tavily Extract → stdlib (Node `fetch` + regex, degraded). Every degraded result is marked.

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
                     [--corroborate N] [--source hn|reddit|...] [--include-domain D]
wsc fetch <url> [moreUrls...] [--format markdown|html] [--screenshot] [--concurrency N]
wsc verify [urls...] [--from-receipt <call_id>] [--concurrency N]
wsc crawl <url> [--max-pages N] [--apply] [--i-know-this-burns-credits]
wsc search <query> [--time week|month] [--country US] [--max-results N]
                   [--corroborate N] [--source hn|reddit|...] [--include-domain D]
wsc deepdive <query> [--depth shallow|standard|deep] [--time week|month]
                     [--source hn|reddit|...] [--include-domain D]

# Auto-route
wsc plan <query> [--budget N] [--prefer fast|deep] [--explain] [--router rule|llm]

# MCP server (for any MCP-aware agent — see "Connect from any agent")
wsc mcp                                        # stdio JSON-RPC; configure once per agent

# Audit
wsc receipts tail [--lines N] [--tool TOOL] [--since 1h] [--provider X]
wsc receipts summary [--days N] [--by-domain] [--cost] [--high-confidence]

# Cache
wsc cache stats
wsc cache clear [--all|--older-than D|--expired-only|--op X|--provider Y]

# Global flags
--json                                         # default off; auto-on when stdout is not a TTY
--quiet
--no-receipt                                   # skip audit log write
--no-cache                                     # skip cache read/write (also: WSC_NO_CACHE=1)
--budget N                                     # override per-task search budget
```

---

## Hermit integration

Set `WSC_CORRELATION_ID` to a UUID at the start of an agent task; every `wsc` call inside that task records the same correlation_id, letting downstream stores group receipts into evidence cases.

```bash
export WSC_CORRELATION_ID=$(uuidgen)
wsc deepdive "approval gating receipts" --depth deep
wsc receipts tail --lines 1 | jq '.correlation_id'   # equals the UUID
```

`wsc deepdive` also assigns a single `parent_call_id` to all underlying search/fetch/verify children, making the lineage tree explicit.

---

## Development

```bash
git clone https://github.com/heggria/web-surfing-cli
cd web-surfing-cli
bun install
bun test                  # 172 tests
bun run lint              # tsc --noEmit
bun run dev -- --version  # run the CLI from source
bun run build             # build dist/cli.mjs (npm bundle)
bun run build:bin         # build all four single-binary targets
```

---

## Status

**v0.4 GA.** New in v0.4: MCP server (`wsc mcp`) so any MCP-aware agent (Claude Code, Claude Desktop, opencode, codex, Cursor, Cline, Continue) can drive `wsc` with the same routing/citation guidance built into each tool description; `AGENTS.md` for agents that don't speak MCP (aider, raw CLI agents, Cursor rules).

Shipped earlier:

- ✅ v0.3: Content-addressed cache, `--corroborate` cross-validation, `wsc verify` + `wsc deepdive`, batch `wsc fetch`, Tavily Extract fallback, `--source` / `--include-domain`, discussions/opinions routing.
- ✅ v0.2: TypeScript/Bun rewrite, plugin marketplace, audit receipts, kill-switch.

Reserved for later:

- LLM-backed router (`--router llm`) — scaffold present, throws today.
- `wsc config doctor --deep` real probes (currently returns `skipped`).
- `wsc summarize` / `wsc digest` LLM-summarization wrappers.

---

## License

[MIT](LICENSE)
