/**
 * Configuration: keys, budget caps, kill-switch, doctor.
 *
 * On-disk roots, all overridable via env so tests can isolate to tmp:
 * - WSC_CONFIG_DIR (default ~/.config/wsc)  — keys.toml, budget.toml,
 *   disabled/<provider> flag files.
 * - WSC_STATE_DIR  (default ~/.local/state/wsc) — audit.jsonl.
 * - WSC_CACHE_DIR  (default ~/.cache/wsc) — content-addressed cache (v0.3).
 *
 * Files are TOML now (we have smol-toml; Bun also ships TOML support but
 * smol-toml lets us run on plain Node too for the npm distribution).
 */

import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { parse as parseToml } from "smol-toml";

// --- Provider catalog -----------------------------------------------------

export interface ProviderMeta {
  needsKey: boolean;
  role: ProviderRole;
  fallbackRoles: ProviderRole[];
  envKeys: string[];
  /** Optional override for which keys.toml section holds this provider's api_key. Default = provider name. */
  fileSection?: string;
  homepage: string;
}

export type ProviderRole =
  | "library_docs"
  | "semantic_discovery"
  | "web_facts"
  | "web_facts_zero_key"
  | "url_fetch"
  | "url_crawl";

export const PROVIDERS: Record<string, ProviderMeta> = {
  context7: {
    needsKey: false,
    role: "library_docs",
    fallbackRoles: [],
    envKeys: ["CONTEXT7_API_KEY"],
    homepage: "https://context7.com",
  },
  exa: {
    needsKey: true,
    role: "semantic_discovery",
    fallbackRoles: ["web_facts"],
    envKeys: ["EXA_API_KEY"],
    homepage: "https://dashboard.exa.ai/api-keys",
  },
  tavily: {
    needsKey: true,
    role: "web_facts",
    fallbackRoles: ["semantic_discovery"],
    envKeys: ["TAVILY_API_KEY"],
    homepage: "https://app.tavily.com/",
  },
  "tavily-extract": {
    needsKey: true,
    role: "url_fetch",
    fallbackRoles: [],
    envKeys: ["TAVILY_API_KEY"],
    fileSection: "tavily",
    homepage: "https://app.tavily.com/",
  },
  firecrawl: {
    needsKey: true,
    role: "url_fetch",
    fallbackRoles: [],
    envKeys: ["FIRECRAWL_API_KEY"],
    homepage: "https://www.firecrawl.dev/app/api-keys",
  },
  brave: {
    needsKey: true,
    role: "web_facts",
    fallbackRoles: ["semantic_discovery"],
    envKeys: ["BRAVE_API_KEY", "BRAVE_SEARCH_API_KEY"],
    homepage: "https://api.search.brave.com/app/keys",
  },
  duckduckgo: {
    needsKey: false,
    role: "web_facts_zero_key",
    fallbackRoles: ["semantic_discovery"],
    envKeys: [],
    homepage: "https://duckduckgo.com",
  },
};

export const ROLE_FALLBACK_CHAIN: Record<ProviderRole, string[]> = {
  library_docs: ["context7", "firecrawl", "duckduckgo"],
  semantic_discovery: ["exa", "tavily", "brave", "duckduckgo"],
  web_facts: ["tavily", "brave", "duckduckgo"],
  web_facts_zero_key: ["duckduckgo"],
  url_fetch: ["firecrawl", "tavily-extract"],
  url_crawl: ["firecrawl"],
};

// --- Paths ----------------------------------------------------------------

export function configDir(): string {
  return process.env.WSC_CONFIG_DIR ?? resolve(homedir(), ".config/wsc");
}

export function cacheDir(): string {
  return process.env.WSC_CACHE_DIR ?? resolve(homedir(), ".cache/wsc");
}

export function stateDir(): string {
  return process.env.WSC_STATE_DIR ?? resolve(homedir(), ".local/state/wsc");
}

export function keysPath(): string {
  return resolve(configDir(), "keys.toml");
}

export function budgetPath(): string {
  return resolve(configDir(), "budget.toml");
}

export function disabledDir(): string {
  return resolve(configDir(), "disabled");
}

// --- Templates ------------------------------------------------------------

const KEYS_TEMPLATE = `# wsc API keys
#
# Each table maps to a provider. Set api_key = "..." to enable; comment out
# to disable that provider (wsc will fall back per the routing policy).
# Environment variables (e.g. EXA_API_KEY) take precedence over this file,
# so you can keep secrets out of $HOME if you prefer.

[context7]
# Optional. Free tier works without a key but with rate limits.
# api_key = "ctx7_..."

[exa]
# Get one at https://dashboard.exa.ai/api-keys
# api_key = "exa_..."

[tavily]
# Get one at https://app.tavily.com/
# api_key = "tvly_..."

[firecrawl]
# Get one at https://www.firecrawl.dev/app/api-keys
# api_key = "fc_..."

[brave]
# Get one at https://api.search.brave.com/app/keys
# Brave is a peer search provider, not a zero-key fallback.
# api_key = "BSA..."
`;

const BUDGET_TEMPLATE = `# wsc per-provider daily caps. wsc hard-fails when a cap would be exceeded.
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
`;

// --- Loaders --------------------------------------------------------------

function readToml(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {};
  try {
    return parseToml(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export interface ProviderKeys {
  apiKeys: Record<string, string>;
  get(provider: string): string | undefined;
}

export function loadKeys(): ProviderKeys {
  const file = readToml(keysPath());
  const apiKeys: Record<string, string> = {};
  for (const [provider, meta] of Object.entries(PROVIDERS)) {
    // Env var wins.
    let envValue: string | undefined;
    for (const envName of meta.envKeys) {
      const v = process.env[envName];
      if (v) {
        envValue = v;
        break;
      }
    }
    if (envValue) {
      apiKeys[provider] = envValue;
      continue;
    }
    const sectionKey = meta.fileSection ?? provider;
    const section = file[sectionKey];
    if (section && typeof section === "object") {
      const k = (section as Record<string, unknown>)["api_key"];
      if (typeof k === "string" && k.trim()) {
        apiKeys[provider] = k.trim();
      }
    }
  }
  return {
    apiKeys,
    get(provider: string) {
      return apiKeys[provider];
    },
  };
}

export interface BudgetCaps {
  perProvider: Record<string, Record<string, number>>;
  forProvider(provider: string): Record<string, number>;
}

export function loadBudget(): BudgetCaps {
  const file = readToml(budgetPath());
  const caps: Record<string, Record<string, number>> = {};
  for (const [section, value] of Object.entries(file)) {
    if (!value || typeof value !== "object") continue;
    const sectionCaps: Record<string, number> = {};
    for (const k of ["daily_credit_cap", "daily_usd_cap"]) {
      const v = (value as Record<string, unknown>)[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        sectionCaps[k] = v;
      }
    }
    if (Object.keys(sectionCaps).length > 0) caps[section] = sectionCaps;
  }
  return {
    perProvider: caps,
    forProvider(provider: string) {
      return caps[provider] ?? {};
    },
  };
}

// --- Kill-switch ----------------------------------------------------------

export function isDisabled(provider: string): boolean {
  return existsSync(resolve(disabledDir(), provider));
}

export function disable(provider: string): string {
  if (!(provider in PROVIDERS)) throw new Error(`unknown provider: ${provider}`);
  ensureDir(disabledDir());
  const flag = resolve(disabledDir(), provider);
  writeFileSync(flag, "disabled\n", "utf8");
  return flag;
}

export function enable(provider: string): boolean {
  if (!(provider in PROVIDERS)) throw new Error(`unknown provider: ${provider}`);
  const flag = resolve(disabledDir(), provider);
  if (existsSync(flag)) {
    unlinkSync(flag);
    return true;
  }
  return false;
}

// --- Init -----------------------------------------------------------------

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export interface InitPayload {
  ok: true;
  operation: "init";
  actions: string[];
  paths: {
    config_dir: string;
    state_dir: string;
    cache_dir: string;
    keys_path: string;
    budget_path: string;
  };
  returncode: 0;
}

export function init(opts: { force?: boolean } = {}): InitPayload {
  const actions: string[] = [];
  const cdir = configDir();
  const sdir = stateDir();
  const chdir = cacheDir();
  const ddir = disabledDir();

  for (const d of [cdir, sdir, chdir, ddir]) {
    if (!existsSync(d)) {
      mkdirSync(d, { recursive: true });
      actions.push(`created dir ${d}`);
    }
  }

  const kp = keysPath();
  if (opts.force || !existsSync(kp)) {
    writeFileSync(kp, KEYS_TEMPLATE, "utf8");
    try {
      chmodSync(kp, 0o600);
    } catch {
      /* ignore on platforms without POSIX perms */
    }
    actions.push(`wrote ${kp}`);
  }
  const bp = budgetPath();
  if (opts.force || !existsSync(bp)) {
    writeFileSync(bp, BUDGET_TEMPLATE, "utf8");
    try {
      chmodSync(bp, 0o600);
    } catch {
      /* ignore */
    }
    actions.push(`wrote ${bp}`);
  }

  return {
    ok: true,
    operation: "init",
    actions,
    paths: {
      config_dir: cdir,
      state_dir: sdir,
      cache_dir: chdir,
      keys_path: kp,
      budget_path: bp,
    },
    returncode: 0,
  };
}

// --- Doctor ---------------------------------------------------------------

export interface DoctorRow {
  provider: string;
  role: ProviderRole;
  status: "ready" | "no_key" | "disabled" | "degraded";
  needs_key: boolean;
  has_key: boolean;
  env_keys: string[];
  budget: Record<string, number>;
  homepage: string;
}

export interface DoctorPayload {
  ok: boolean;
  operation: "config.doctor";
  providers: DoctorRow[];
  role_fallback_chains: Record<ProviderRole, string[]>;
  config_paths: { keys: string; budget: string; disabled_dir: string };
  returncode: number;
  deep: boolean;
  hint?: string;
  deep_probes?: Record<string, { status: string; reason: string }>;
}

export function doctor(opts: { deep?: boolean } = {}): DoctorPayload {
  const keys = loadKeys();
  const budget = loadBudget();
  const rows: DoctorRow[] = [];
  for (const [name, meta] of Object.entries(PROVIDERS)) {
    const hasKey = !!keys.get(name);
    let status: DoctorRow["status"];
    if (isDisabled(name)) status = "disabled";
    else if (meta.needsKey && !hasKey) status = "no_key";
    else if (name === "duckduckgo") status = "degraded";
    else status = "ready";
    rows.push({
      provider: name,
      role: meta.role,
      status,
      needs_key: meta.needsKey,
      has_key: hasKey,
      env_keys: meta.envKeys,
      budget: budget.forProvider(name),
      homepage: meta.homepage,
    });
  }

  const available = new Set(rows.filter((r) => r.status === "ready" || r.status === "degraded").map((r) => r.provider));
  const roleChains: Record<string, string[]> = {};
  for (const [role, chain] of Object.entries(ROLE_FALLBACK_CHAIN)) {
    roleChains[role] = chain.filter((p) => available.has(p));
  }

  const payload: DoctorPayload = {
    ok: true,
    operation: "config.doctor",
    providers: rows,
    role_fallback_chains: roleChains as Record<ProviderRole, string[]>,
    config_paths: { keys: keysPath(), budget: budgetPath(), disabled_dir: disabledDir() },
    returncode: 0,
    deep: !!opts.deep,
  };
  if (opts.deep) {
    payload.deep_probes = Object.fromEntries(
      Object.keys(PROVIDERS).map((p) => [p, { status: "skipped", reason: "deep probes ship in v0.3" }]),
    );
  }
  const primary = ["context7", "exa", "tavily", "firecrawl"];
  const workable = primary.filter((p) => available.has(p));
  if (workable.length === 0) {
    payload.ok = false;
    payload.returncode = 1;
    payload.hint =
      "No primary providers are ready. Run `wsc init`, edit keys.toml, or set EXA_API_KEY / TAVILY_API_KEY / FIRECRAWL_API_KEY in your env.";
  }
  return payload;
}
