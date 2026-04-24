---
allowed-tools: Bash(wsc:*), Bash(command:*), Bash(~/.local/bin/wsc:*)
description: Show recent wsc audit receipts (every web call writes one). Use to diagnose what was called, which provider answered, what fell back, and how much budget was spent.
argument-hint: [--lines N] [--tool TOOL] [--since 1h] [--provider X] [--summary]
---

Read the wsc audit log at `~/.local/state/wsc/audit.jsonl`. Use this to:

- See what providers Claude has been calling and why
- Diagnose a failed run by reading the `fallback_chain` and `error` fields
- Track per-day cost and per-domain selection patterns

**Precondition:** verify `wsc` is on PATH. If not, run `/web-install` and stop.

**Default — last 20 receipts:**

```bash
wsc --json receipts tail --lines 20
```

**Filtered:**

```bash
wsc --json receipts tail --tool fetch --since 1h
wsc --json receipts tail --provider exa --lines 50
```

**Aggregated summary:**

```bash
wsc --json receipts summary --days 7 --by-domain --cost
wsc --json receipts summary --days 1 --cost            # today's spend
wsc --json receipts summary --high-confidence          # ≥2 provider agreement (v0.2)
```

**What each receipt contains:**

- `call_id`, `parent_call_id`, `correlation_id` (from `WSC_CORRELATION_ID` env if set)
- `op`, `provider`, `fallback_chain` (list of `{from, reason}`)
- `query_hash` + `query_preview` — query plaintext is **never** stored in full
- `selected_urls` — secret query params (`token`, `api_key`, etc.) are auto-redacted before disk
- `route_decision` (for `plan` only) — full classifier output
- `duration_ms`, `cost_units`, `cost_usd_estimated` (when known)
- `status` — `ok` | `degraded` | `error`
