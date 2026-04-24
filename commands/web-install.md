---
allowed-tools: Bash(command:*), Bash(npm:*), Bash(bun:*), Bash(bunx:*), Bash(node:*), Bash(which:*), Bash(echo:*), Bash(curl:*)
description: Install or upgrade the wsc CLI (web-surfing-cli) via npm or bun. Run this when /web, /web-docs, /web-fetch etc. report "wsc not installed".
---

The web-surfing-cli plugin contains slash commands and a routing skill, but **does not ship the CLI binary**. The `wsc` CLI is distributed via npm and as standalone binaries.

Pick one install path for the user — they all give them a global `wsc` command.

**Path 1 — npm (works everywhere Node ≥ 18 is installed):**

```bash
npm i -g github:heggria/web-surfing-cli
wsc --version
```

If `npm publish` has happened (check https://www.npmjs.com/package/web-surfing-cli):

```bash
npm i -g web-surfing-cli
```

**Path 2 — bun (faster install if they have Bun):**

```bash
bun add -g github:heggria/web-surfing-cli
wsc --version
```

Or run without installing:

```bash
bunx web-surfing-cli@latest --version
```

**Path 3 — single binary (Node-free, ~63 MB):**

Pick the right asset from https://github.com/heggria/web-surfing-cli/releases and curl it:

```bash
# macOS Apple Silicon
curl -fsSL https://github.com/heggria/web-surfing-cli/releases/latest/download/wsc-darwin-arm64.tar.gz \
  | tar -xz -C ~/.local/bin
chmod +x ~/.local/bin/wsc-darwin-arm64
mv ~/.local/bin/wsc-darwin-arm64 ~/.local/bin/wsc
wsc --version
```

(Substitute `darwin-x64`, `linux-x64`, or `linux-arm64` as needed.)

**Then initialize and configure:**

```bash
wsc init                # writes ~/.config/wsc/{keys.toml,budget.toml} and state dirs
wsc config doctor       # shows which providers are ready / no_key / disabled
```

**Tell the user what to do next:**

After install, they typically want to set provider keys. Either edit `~/.config/wsc/keys.toml`, **or** set env vars (these take precedence):

- `EXA_API_KEY` — get one at https://dashboard.exa.ai/api-keys
- `TAVILY_API_KEY` — get one at https://app.tavily.com/
- `FIRECRAWL_API_KEY` — get one at https://www.firecrawl.dev/app/api-keys
- `BRAVE_API_KEY` — get one at https://api.search.brave.com/app/keys
- `CONTEXT7_API_KEY` — optional, free tier works without a key

Re-run `wsc config doctor` to confirm. Then re-try whichever slash command brought them here.
