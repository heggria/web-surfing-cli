import { describe, expect, test } from "bun:test";
import { setupTestEnv } from "./_setup.js";

setupTestEnv();
import { readFileSync } from "node:fs";
import * as audit from "../src/audit.js";

function readLines(): Record<string, unknown>[] {
  return readFileSync(audit.auditPath(), "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

describe("audit.record", () => {
  test("writes one JSONL line with ts", async () => {
    await audit.record({ call_id: "abc", op: "fetch", provider: "firecrawl" });
    const events = readLines();
    expect(events.length).toBe(1);
    expect(events[0]!.call_id).toBe("abc");
    expect(events[0]!.op).toBe("fetch");
    expect((events[0]!.ts as string).endsWith("Z")).toBe(true);
  });

  test("redacts url field", async () => {
    await audit.record({ op: "fetch", url: "https://example.com/?token=SECRET&q=hi" } as never);
    const line = readFileSync(audit.auditPath(), "utf8");
    expect(line).not.toContain("SECRET");
    expect(line).toContain("q=hi");
  });

  test("redacts urls in nested arrays", async () => {
    await audit.record({
      op: "discover",
      selected_urls: ["https://a.example/?api_key=X", "https://b.example/page"],
    });
    const line = readFileSync(audit.auditPath(), "utf8");
    expect(line).not.toContain("=X");
    expect(line).toContain("https://b.example/page");
  });
});

describe("audit.withCall", () => {
  test("records duration and correlation", async () => {
    process.env.WSC_CORRELATION_ID = "corr-123";
    await audit.withCall("plan", { provider: "exa" }, async (receipt) => {
      receipt.results_count = 5;
    });
    const events = readLines();
    expect(events.length).toBe(1);
    const ev = events[0]!;
    expect(ev.op).toBe("plan");
    expect(ev.provider).toBe("exa");
    expect(ev.correlation_id).toBe("corr-123");
    expect(ev.status).toBe("ok");
    expect(ev.results_count).toBe(5);
    expect((ev.duration_ms as number) >= 0).toBe(true);
  });

  test("marks error on exception and re-throws", async () => {
    let threw = false;
    try {
      await audit.withCall("fetch", { provider: "firecrawl" }, async () => {
        throw new Error("boom");
      });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    const ev = readLines()[0]!;
    expect(ev.status).toBe("error");
    expect((ev.error as string).includes("boom")).toBe(true);
  });

  test("noReceipt skips write", async () => {
    await audit.withCall("plan", { provider: "exa", noReceipt: true }, async () => undefined);
    expect(() => readFileSync(audit.auditPath(), "utf8")).toThrow();
  });
});

describe("audit.tail", () => {
  test("filters by op and provider", async () => {
    await audit.record({ op: "fetch", provider: "firecrawl", call_id: "1" });
    await audit.record({ op: "discover", provider: "exa", call_id: "2" });
    await audit.record({ op: "discover", provider: "tavily", call_id: "3" });
    const out = await audit.tail({ op: "discover", provider: "exa" });
    expect(out.events.map((e) => e.call_id)).toEqual(["2"]);
  });
});

describe("audit.summary", () => {
  test("counts by op/provider/status", async () => {
    await audit.record({ op: "fetch", provider: "firecrawl", status: "ok" });
    await audit.record({ op: "fetch", provider: "firecrawl", status: "ok" });
    await audit.record({ op: "discover", provider: "exa", status: "ok" });
    const s = await audit.summary({});
    expect(s.event_count).toBe(3);
    expect(s.by_op).toEqual({ fetch: 2, discover: 1 });
    expect(s.by_provider).toEqual({ firecrawl: 2, exa: 1 });
    expect(s.by_status).toEqual({ ok: 3 });
  });
});

describe("audit.parseSince", () => {
  test("accepts s/m/h/d", () => {
    expect(typeof audit.parseSince("1m")).toBe("string");
    expect(typeof audit.parseSince("2h")).toBe("string");
    expect(typeof audit.parseSince("7d")).toBe("string");
  });
  test("rejects unknown units", () => {
    expect(() => audit.parseSince("5x")).toThrow();
  });
});
