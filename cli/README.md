# wsc — web-surfing-cli

Python CLI side of `web-surfing-cli`. Installable standalone via `pipx`; you do **not** need Claude Code to use it.

## Install

```bash
pipx install git+https://github.com/heggria/web-surfing-cli.git#subdirectory=cli
wsc --version
wsc init                  # writes ~/.config/wsc/{keys.toml,budget.toml}, creates state dir
$EDITOR ~/.config/wsc/keys.toml
wsc config doctor         # verify each provider's availability
```

## Quick tour

```bash
wsc docs react --topic hooks                 # → Context7
wsc discover "alternatives to Hermit"        # → Exa
wsc search "claude 4.7 latest features"      # → Tavily
wsc fetch https://docs.anthropic.com/        # → Firecrawl
wsc plan "react 19 useActionState"           # auto-routes + writes a receipt
wsc receipts tail --lines 10                 # audit log
```

## Conventions (mirrors `hsctl`)

- `--json` is **off by default** (human output) and **auto-on** when stdout is not a terminal (so agents and pipelines get JSON without flags) or when `WSC_JSON=1`.
- Write/cost-incurring operations require `--apply` past a threshold.
- Every provider call writes a redacted receipt to `~/.local/state/wsc/audit.jsonl`.
- `wsc config disable <provider>` is a one-line kill switch.

## Status

v0.1 alpha — see [`PLAN.md`](../docs/PLAN.md) (TODO) and the repo root README.

## License

MIT
