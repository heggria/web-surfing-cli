import { describe, expect, test } from "bun:test";
import { setupTestEnv } from "./_setup.js";

setupTestEnv();
import { readFileSync, writeFileSync, statSync } from "node:fs";
import * as config from "../src/config.js";

describe("config.init", () => {
  test("creates dirs and templates", () => {
    const out = config.init();
    expect(out.ok).toBe(true);
    expect(out.actions.some((a) => a.includes("created dir"))).toBe(true);
    expect(out.actions.some((a) => a.includes("keys.toml"))).toBe(true);
    expect(out.actions.some((a) => a.includes("budget.toml"))).toBe(true);
    // permissions tightened on POSIX
    const mode = statSync(config.keysPath()).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  test("is idempotent", () => {
    config.init();
    const second = config.init();
    expect(second.actions.every((a) => !a.includes("wrote"))).toBe(true);
  });

  test("force overwrites", () => {
    config.init();
    writeFileSync(config.keysPath(), "# user edits\n");
    const out = config.init({ force: true });
    expect(out.actions.some((a) => a.includes("wrote"))).toBe(true);
    expect(readFileSync(config.keysPath(), "utf8")).not.toContain("user edits");
  });
});

describe("config.loadKeys", () => {
  test("env wins over file", () => {
    config.init();
    writeFileSync(config.keysPath(), '[exa]\napi_key = "file_key"\n');
    process.env.EXA_API_KEY = "env_key";
    const keys = config.loadKeys();
    expect(keys.get("exa")).toBe("env_key");
  });

  test("file used when env absent", () => {
    config.init();
    writeFileSync(config.keysPath(), '[exa]\napi_key = "file_key"\n');
    delete process.env.EXA_API_KEY;
    const keys = config.loadKeys();
    expect(keys.get("exa")).toBe("file_key");
  });
});

describe("config.loadBudget", () => {
  test("parses caps", () => {
    config.init();
    writeFileSync(config.budgetPath(), "[exa]\ndaily_credit_cap = 100\ndaily_usd_cap = 5.5\n");
    const b = config.loadBudget();
    expect(b.forProvider("exa")).toEqual({ daily_credit_cap: 100, daily_usd_cap: 5.5 });
    expect(b.forProvider("tavily")).toEqual({});
  });
});

describe("config disable/enable", () => {
  test("round-trip", () => {
    config.init();
    config.disable("exa");
    expect(config.isDisabled("exa")).toBe(true);
    expect(config.enable("exa")).toBe(true);
    expect(config.isDisabled("exa")).toBe(false);
  });

  test("rejects unknown provider", () => {
    expect(() => config.disable("not-real")).toThrow();
  });
});

describe("config.doctor", () => {
  test("marks no_key when needed", () => {
    config.init();
    const out = config.doctor();
    const rows = Object.fromEntries(out.providers.map((r) => [r.provider, r]));
    expect(rows.exa!.status).toBe("no_key");
    expect(rows.context7!.status).toBe("ready"); // free tier
    expect(rows.duckduckgo!.status).toBe("degraded");
    // context7 free tier alone makes ok=true
    expect(out.ok).toBe(true);
  });

  test("returncode 1 when context7 disabled and no other keys", () => {
    config.init();
    config.disable("context7");
    const out = config.doctor();
    expect(out.ok).toBe(false);
    expect(out.returncode).toBe(1);
    expect(out.hint).toBeDefined();
  });

  test("ready when env key set", () => {
    config.init();
    process.env.EXA_API_KEY = "x";
    const out = config.doctor();
    const rows = Object.fromEntries(out.providers.map((r) => [r.provider, r]));
    expect(rows.exa!.status).toBe("ready");
    expect(out.ok).toBe(true);
  });

  test("disabled marker shows up", () => {
    config.init();
    config.disable("exa");
    const out = config.doctor();
    const rows = Object.fromEntries(out.providers.map((r) => [r.provider, r]));
    expect(rows.exa!.status).toBe("disabled");
  });

  test("live chains exclude unavailable providers", () => {
    config.init();
    process.env.TAVILY_API_KEY = "x";
    process.env.FIRECRAWL_API_KEY = "y";
    const out = config.doctor();
    expect(out.role_fallback_chains.semantic_discovery[0]).toBe("tavily");
    // url_fetch chain: firecrawl primary, tavily-extract fallback (also wants TAVILY_API_KEY).
    expect(out.role_fallback_chains.url_fetch).toEqual(["firecrawl", "tavily-extract"]);
  });
});
