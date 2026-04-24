#!/usr/bin/env bash
# Verify package.json version == .claude-plugin/plugin.json version.
# Run by CI; also useful as a pre-tag check.

set -euo pipefail

cd "$(dirname "$0")/.."

cli_version=$(node -e 'console.log(require("./package.json").version)')
plugin_version=$(node -e 'console.log(require("./.claude-plugin/plugin.json").version)')

if [[ -z "$cli_version" ]]; then
  echo "ERROR: could not parse version from package.json" >&2
  exit 1
fi
if [[ -z "$plugin_version" ]]; then
  echo "ERROR: could not parse version from .claude-plugin/plugin.json" >&2
  exit 1
fi

if [[ "$cli_version" != "$plugin_version" ]]; then
  echo "ERROR: version drift" >&2
  echo "  package.json                version = $cli_version" >&2
  echo "  .claude-plugin/plugin.json  version = $plugin_version" >&2
  echo "" >&2
  echo "Bump both to the same value before tagging." >&2
  exit 1
fi

echo "ok: package + plugin agree on version $cli_version"
