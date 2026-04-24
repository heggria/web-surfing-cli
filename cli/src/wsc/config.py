"""Configuration: keys, budget caps, kill-switch, doctor.

All on-disk state is segregated into three roots so tests can override via
env vars without touching real user data:

* ``WSC_CONFIG_DIR`` (defaults to ``~/.config/wsc``) — keys.ini, budget.ini,
  ``disabled/<provider>`` flag files.
* ``WSC_STATE_DIR`` (defaults to ``~/.local/state/wsc``) — audit.jsonl.
* ``WSC_CACHE_DIR`` (defaults to ``~/.cache/wsc``) — content-addressed
  cache (v0.2; only the directory is created in v0.1).

Files are INI rather than TOML so we can stay zero-dependency on
Python 3.9 (which lacks ``tomllib``).
"""

from __future__ import annotations

import configparser
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional

# --- Provider catalog -----------------------------------------------------

# A provider can require a key (or not) and play one or more "roles" in the
# routing layer. The catalog is the single source of truth for `wsc config
# doctor`, the kill-switch, and per-provider budgeting.
PROVIDERS: Dict[str, Dict[str, object]] = {
    "context7": {
        "needs_key": False,  # free tier works without a key
        "role": "library_docs",
        "fallback_roles": [],
        "env_keys": ["CONTEXT7_API_KEY"],
        "homepage": "https://context7.com",
    },
    "exa": {
        "needs_key": True,
        "role": "semantic_discovery",
        "fallback_roles": ["web_facts"],
        "env_keys": ["EXA_API_KEY"],
        "homepage": "https://dashboard.exa.ai/api-keys",
    },
    "tavily": {
        "needs_key": True,
        "role": "web_facts",
        "fallback_roles": ["semantic_discovery"],
        "env_keys": ["TAVILY_API_KEY"],
        "homepage": "https://app.tavily.com/",
    },
    "firecrawl": {
        "needs_key": True,
        "role": "url_fetch",
        "fallback_roles": [],
        "env_keys": ["FIRECRAWL_API_KEY"],
        "homepage": "https://www.firecrawl.dev/app/api-keys",
    },
    "brave": {
        "needs_key": True,
        "role": "web_facts",
        "fallback_roles": ["semantic_discovery"],
        "env_keys": ["BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY"],
        "homepage": "https://api.search.brave.com/app/keys",
    },
    "duckduckgo": {
        "needs_key": False,  # HTML scrape, degraded
        "role": "web_facts_zero_key",
        "fallback_roles": ["semantic_discovery"],
        "env_keys": [],
        "homepage": "https://duckduckgo.com",
    },
}

# Default fallback chains per role. M2 providers consult this when their primary fails.
ROLE_FALLBACK_CHAIN: Dict[str, List[str]] = {
    "library_docs": ["context7", "firecrawl", "duckduckgo"],
    "semantic_discovery": ["exa", "tavily", "brave", "duckduckgo"],
    "web_facts": ["tavily", "brave", "duckduckgo"],
    "url_fetch": ["firecrawl"],  # no fallback — fail loud
    "url_crawl": ["firecrawl"],
}


# --- Paths ----------------------------------------------------------------


def config_dir() -> Path:
    return Path(os.environ.get("WSC_CONFIG_DIR", "~/.config/wsc")).expanduser()


def cache_dir() -> Path:
    return Path(os.environ.get("WSC_CACHE_DIR", "~/.cache/wsc")).expanduser()


def keys_path() -> Path:
    return config_dir() / "keys.ini"


def budget_path() -> Path:
    return config_dir() / "budget.ini"


def disabled_dir() -> Path:
    return config_dir() / "disabled"


# --- Templates ------------------------------------------------------------


KEYS_TEMPLATE = """\
# wsc API keys
#
# Each section maps to a provider. Set api_key = ... to enable; leave
# commented to disable that provider (wsc will fall back per the routing
# policy). Environment variables (e.g. EXA_API_KEY) take precedence over
# this file, so you can keep secrets out of $HOME if you prefer.

[context7]
# Optional. Free tier works without a key but with rate limits.
# api_key =

[exa]
# Get one at https://dashboard.exa.ai/api-keys
# api_key =

[tavily]
# Get one at https://app.tavily.com/
# api_key =

[firecrawl]
# Get one at https://www.firecrawl.dev/app/api-keys
# api_key =

[brave]
# Get one at https://api.search.brave.com/app/keys
# Brave is a peer search provider, not a zero-key fallback.
# api_key =
"""


BUDGET_TEMPLATE = """\
# wsc per-provider daily caps. wsc hard-fails when a cap would be exceeded.
# Comment a key to disable that cap (not recommended).

[exa]
daily_credit_cap = 1000
# daily_usd_cap = 5.00

[tavily]
daily_credit_cap = 1000
# daily_usd_cap = 5.00

[firecrawl]
daily_credit_cap = 500
# daily_usd_cap = 10.00

[brave]
daily_credit_cap = 2000
# daily_usd_cap = 0.00  # free tier; rate limited
"""


# --- Loaders --------------------------------------------------------------


@dataclass(frozen=True)
class ProviderKeys:
    api_keys: Dict[str, str] = field(default_factory=dict)

    def get(self, provider: str) -> Optional[str]:
        return self.api_keys.get(provider)


def _read_ini(path: Path) -> configparser.ConfigParser:
    cp = configparser.ConfigParser()
    if path.exists():
        cp.read(path, encoding="utf-8")
    return cp


def load_keys() -> ProviderKeys:
    """Load keys with env-var precedence over file."""
    cp = _read_ini(keys_path())
    api_keys: Dict[str, str] = {}
    for provider, meta in PROVIDERS.items():
        # Env var wins.
        env_value = None
        for env_name in meta.get("env_keys", []):  # type: ignore[arg-type]
            v = os.environ.get(env_name)
            if v:
                env_value = v
                break
        if env_value:
            api_keys[provider] = env_value
            continue
        if cp.has_section(provider):
            v = cp.get(provider, "api_key", fallback="").strip()
            if v:
                api_keys[provider] = v
    return ProviderKeys(api_keys=api_keys)


@dataclass(frozen=True)
class BudgetCaps:
    per_provider: Dict[str, Dict[str, float]] = field(default_factory=dict)

    def for_provider(self, provider: str) -> Dict[str, float]:
        return self.per_provider.get(provider, {})


def load_budget() -> BudgetCaps:
    cp = _read_ini(budget_path())
    caps: Dict[str, Dict[str, float]] = {}
    for section in cp.sections():
        section_caps: Dict[str, float] = {}
        for k in ("daily_credit_cap", "daily_usd_cap"):
            if cp.has_option(section, k):
                try:
                    section_caps[k] = float(cp.get(section, k))
                except ValueError:
                    pass
        if section_caps:
            caps[section] = section_caps
    return BudgetCaps(per_provider=caps)


# --- Kill-switch ----------------------------------------------------------


def is_disabled(provider: str) -> bool:
    return (disabled_dir() / provider).exists()


def disable(provider: str) -> Path:
    if provider not in PROVIDERS:
        raise ValueError(f"unknown provider: {provider}")
    flag = disabled_dir() / provider
    flag.parent.mkdir(parents=True, exist_ok=True)
    flag.write_text("disabled\n", encoding="utf-8")
    return flag


def enable(provider: str) -> bool:
    if provider not in PROVIDERS:
        raise ValueError(f"unknown provider: {provider}")
    flag = disabled_dir() / provider
    if flag.exists():
        flag.unlink()
        return True
    return False


# --- Init -----------------------------------------------------------------


def init(*, force: bool = False) -> Dict[str, object]:
    """Idempotent setup: dirs + key/budget templates."""
    actions: List[str] = []
    cdir = config_dir()
    sdir = Path(os.environ.get("WSC_STATE_DIR", "~/.local/state/wsc")).expanduser()
    chdir = cache_dir()
    ddir = disabled_dir()

    for d in (cdir, sdir, chdir, ddir):
        if not d.exists():
            d.mkdir(parents=True, exist_ok=True)
            actions.append(f"created dir {d}")

    kp = keys_path()
    if force or not kp.exists():
        kp.write_text(KEYS_TEMPLATE, encoding="utf-8")
        try:
            os.chmod(kp, 0o600)
        except OSError:
            pass
        actions.append(f"wrote {kp}")
    bp = budget_path()
    if force or not bp.exists():
        bp.write_text(BUDGET_TEMPLATE, encoding="utf-8")
        try:
            os.chmod(bp, 0o600)
        except OSError:
            pass
        actions.append(f"wrote {bp}")

    return {
        "ok": True,
        "operation": "init",
        "actions": actions,
        "paths": {
            "config_dir": str(cdir),
            "state_dir": str(sdir),
            "cache_dir": str(chdir),
            "keys_path": str(kp),
            "budget_path": str(bp),
        },
        "returncode": 0,
    }


# --- Doctor ---------------------------------------------------------------


def doctor(*, deep: bool = False) -> Dict[str, object]:
    """Per-provider availability snapshot.

    ``status`` values:
    * ``ready``     — key is present (or not needed) and not disabled.
    * ``no_key``    — needs a key, none is configured.
    * ``disabled``  — kill-switch flag present.
    * ``degraded``  — provider works without key but with caveats (e.g. duckduckgo).
    """

    keys = load_keys()
    budget = load_budget()
    rows: List[Dict[str, object]] = []
    for name, meta in PROVIDERS.items():
        has_key = bool(keys.get(name))
        needs = bool(meta["needs_key"])
        if is_disabled(name):
            status = "disabled"
        elif needs and not has_key:
            status = "no_key"
        elif name == "duckduckgo":
            status = "degraded"
        else:
            status = "ready"
        rows.append(
            {
                "provider": name,
                "role": meta["role"],
                "status": status,
                "needs_key": needs,
                "has_key": has_key,
                "env_keys": meta["env_keys"],
                "budget": budget.for_provider(name),
                "homepage": meta["homepage"],
            }
        )

    # Compute the live fallback chain per role given current availability.
    available = {r["provider"] for r in rows if r["status"] in ("ready", "degraded")}
    role_chains: Dict[str, List[str]] = {}
    for role, chain in ROLE_FALLBACK_CHAIN.items():
        active = [p for p in chain if p in available]
        role_chains[role] = active

    payload: Dict[str, object] = {
        "ok": True,
        "operation": "config.doctor",
        "providers": rows,
        "role_fallback_chains": role_chains,
        "config_paths": {
            "keys": str(keys_path()),
            "budget": str(budget_path()),
            "disabled_dir": str(disabled_dir()),
        },
        "returncode": 0,
        "deep": deep,
    }
    if deep:
        # M2 will plug real probes here. For now mark explicitly.
        payload["deep_probes"] = {
            p: {"status": "skipped", "reason": "deep probes ship in M2"}
            for p in PROVIDERS
        }
    # Surface a non-zero exit code if no provider is even ready+needed.
    needs_at_least_one = ["context7", "exa", "tavily", "firecrawl"]
    workable = [p for p in needs_at_least_one if p in available]
    if not workable:
        payload["ok"] = False
        payload["returncode"] = 1
        payload["hint"] = (
            "No primary providers are ready. Run `wsc init`, edit keys.ini, "
            "or set EXA_API_KEY / TAVILY_API_KEY / FIRECRAWL_API_KEY in your env."
        )
    return payload
