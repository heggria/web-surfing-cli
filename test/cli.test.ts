/** End-to-end CLI tests via Bun.spawn. */

import { describe, expect, test } from "bun:test";
import { setupTestEnv } from "./_setup.js";

setupTestEnv();
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const CLI = resolve(import.meta.dir, "..", "src", "cli.ts");

function run(args: string[], env: Record<string, string> = {}): { code: number; out: string; err: string } {
  const result = spawnSync("bun", ["run", CLI, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return {
    code: result.status ?? -1,
    out: result.stdout ?? "",
    err: result.stderr ?? "",
  };
}

describe("CLI smoke", () => {
  test("--version", () => {
    const r = run(["--version"]);
    expect(r.code).toBe(0);
    expect(r.out.trim()).toBe("0.3.0");
  });

  test("--help lists subcommands", () => {
    const r = run(["--help"]);
    expect(r.code).toBe(0);
    expect(r.out).toContain("init");
    expect(r.out).toContain("plan");
    expect(r.out).toContain("docs");
    expect(r.out).toContain("discover");
    expect(r.out).toContain("fetch");
    expect(r.out).toContain("crawl");
    expect(r.out).toContain("search");
  });

  test("init writes config files", () => {
    const r = run(["--json", "init"]);
    expect(r.code).toBe(0);
    const payload = JSON.parse(r.out);
    expect(payload.ok).toBe(true);
    expect(payload.operation).toBe("init");
    expect(payload.paths.keys_path).toContain("keys.toml");
  });

  test("config doctor without keys returns ok=true (context7 free tier)", () => {
    run(["--json", "init"]);
    const r = run(["--json", "config", "doctor"]);
    const payload = JSON.parse(r.out);
    const rows = Object.fromEntries((payload.providers as Array<Record<string, unknown>>).map((p) => [p.provider, p]));
    expect(rows.exa!.status).toBe("no_key");
    // context7 makes ok=true alone
    expect(r.code).toBe(0);
  });

  test("plan --explain routes react useState → docs", () => {
    const r = run(["--json", "plan", "react useState", "--explain"]);
    expect(r.code).toBe(0);
    const payload = JSON.parse(r.out);
    expect(payload.decision.recommended_op).toBe("docs");
    expect(payload.would_run).toContain("wsc docs");
  });

  test("crawl --max-pages 50 without --apply blocks", () => {
    const r = run(["--json", "crawl", "https://example.com", "--max-pages", "50"]);
    expect(r.code).toBe(2);
    const payload = JSON.parse(r.out);
    expect(payload.error).toContain("--apply");
  });
});
