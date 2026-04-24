# web-surfing-cli

A unified evidence-acquisition layer for AI agents — one CLI (`wsc`) that hard-codes a routing policy across Context7, Exa, Tavily, Firecrawl, Brave, and DuckDuckGo so your agents stop fighting over which search tool to use.

```
wsc docs <library>      → Context7   (official docs)
wsc discover <query>    → Exa        (semantic / similar projects / papers)
wsc search <query>      → Tavily     (general web facts, news)
wsc fetch <url>         → Firecrawl  (clean a known URL)
wsc crawl <url>         → Firecrawl  (crawl a site, gated by --apply)
wsc plan <query>        → auto-route + budget + receipts
wsc receipts tail       → audit log
```

This repo is **two things at once**:

1. A Python CLI (`cli/`) installed via `pipx`.
2. A Claude Code plugin marketplace (`.claude-plugin/`, `skills/`, `commands/`) installed via `/plugin install`.

**Both must be installed.** The plugin ships the routing skill and slash commands, which call the CLI. See `cli/README.md` for CLI-only usage and the bottom of this file for the Claude Code path.

## Status

v0.1 — under construction. See [the plan](https://github.com/heggria/web-surfing-cli/blob/main/docs/PLAN.md) for milestones.

## License

MIT
