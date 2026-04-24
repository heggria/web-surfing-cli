/** MCP tool registry shape tests — ensures every tool has a name, description, and inputSchema. */

import { describe, expect, test } from "bun:test";
import { setupTestEnv } from "./_setup.js";

setupTestEnv();
import { TOOLS } from "../src/mcp.js";

describe("MCP TOOLS registry", () => {
  test("declares the expected ops", () => {
    const names = TOOLS.map((t) => t.name).sort();
    expect(names).toEqual([
      "wsc_cache_stats",
      "wsc_deepdive",
      "wsc_discover",
      "wsc_docs",
      "wsc_fetch",
      "wsc_plan",
      "wsc_receipts_tail",
      "wsc_search",
      "wsc_verify",
    ]);
  });

  test("every tool has name, description >= 60 chars (carries guidance), and inputSchema", () => {
    for (const t of TOOLS) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(60);
      expect(t.inputSchema).toBeDefined();
      expect((t.inputSchema as Record<string, unknown>).type).toBe("object");
    }
  });

  test("wsc_search description carries the citation discipline rule", () => {
    const search = TOOLS.find((t) => t.name === "wsc_search")!;
    expect(search.description).toContain("PROVIDER SNIPPETS");
    expect(search.description).toContain("wsc_verify");
  });

  test("wsc_verify mentions from_receipt and the cite-before-quote use case", () => {
    const verify = TOOLS.find((t) => t.name === "wsc_verify")!;
    expect(verify.description).toContain("BEFORE citing");
    expect(verify.description).toContain("from_receipt");
  });

  test("wsc_deepdive describes the <evidence> tag output", () => {
    const dd = TOOLS.find((t) => t.name === "wsc_deepdive")!;
    expect(dd.description).toContain("<evidence");
    expect(dd.description).toContain("paste-ready");
  });

  test("wsc_search inputSchema requires query and accepts corroborate / source / include_domains", () => {
    const search = TOOLS.find((t) => t.name === "wsc_search")!;
    const props = (search.inputSchema as Record<string, unknown>).properties as Record<string, unknown>;
    expect((search.inputSchema as Record<string, unknown>).required).toEqual(["query"]);
    expect(props.corroborate).toBeDefined();
    expect(props.source).toBeDefined();
    expect(props.include_domains).toBeDefined();
  });
});
