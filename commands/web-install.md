---
allowed-tools: Bash(command:*), Bash(pipx:*), Bash(python3:*), Bash(which:*), Bash(echo:*)
description: Install or upgrade the wsc CLI (web-surfing-cli) via pipx. Run this when /web, /web-docs, /web-fetch etc. report "wsc not installed".
---

The web-surfing-cli plugin contains slash commands and a routing skill, but **does not ship a Python binary**. The `wsc` CLI must be installed separately via `pipx`.

**Step 1 — check if pipx is available:**

```bash
command -v pipx >/dev/null 2>&1 || { echo "pipx is not installed."; echo ""; echo "Install pipx first:"; echo "  brew install pipx        # macOS"; echo "  python3 -m pip install --user pipx && python3 -m pipx ensurepath"; echo ""; echo "Then re-run /web-install."; exit 64; }
```

**Step 2 — install or upgrade `wsc`:**

```bash
pipx install --force git+https://github.com/heggria/web-surfing-cli.git#subdirectory=cli
```

The `--force` flag makes the command idempotent — safe to re-run for upgrades.

**Step 3 — verify it works and initialize config:**

```bash
wsc --version
wsc init                # creates ~/.config/wsc/{keys.toml,budget.toml} and state dirs
wsc config doctor       # shows which providers are ready / no_key / disabled
```

**Step 4 — tell the user what to do next:**

After install, the user typically wants to set provider keys. Tell them:

- Edit `~/.config/wsc/keys.toml`, **or** set env vars (these take precedence):
  - `EXA_API_KEY` — get one at https://dashboard.exa.ai/api-keys
  - `TAVILY_API_KEY` — get one at https://app.tavily.com/
  - `FIRECRAWL_API_KEY` — get one at https://www.firecrawl.dev/app/api-keys
  - `BRAVE_API_KEY` — get one at https://api.search.brave.com/app/keys
  - `CONTEXT7_API_KEY` — optional, free tier works without a key
- Re-run `wsc config doctor` to confirm.
- Then re-try whatever slash command brought them here.
