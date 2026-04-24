/** Domain helpers — --source presets and --include-domain merging. */

import { describe, expect, test } from "bun:test";
import { setupTestEnv } from "./_setup.js";

setupTestEnv();
import { expandSource, resolveIncludeDomains, SOURCE_PRESETS } from "../src/domains.js";

describe("expandSource", () => {
  test("expands hn", () => {
    expect(expandSource("hn")).toEqual(["news.ycombinator.com"]);
  });
  test("expands reddit to two domains", () => {
    expect(expandSource("reddit")).toEqual(["reddit.com", "old.reddit.com"]);
  });
  test("combines hn+reddit", () => {
    const out = expandSource("hn+reddit");
    expect(out).toContain("news.ycombinator.com");
    expect(out).toContain("reddit.com");
    expect(out).toContain("old.reddit.com");
  });
  test("dedupes", () => {
    const out = expandSource("hn+hn");
    expect(out).toEqual(["news.ycombinator.com"]);
  });
  test("passes through ad-hoc domains", () => {
    expect(expandSource("hn+example.com")).toEqual(["news.ycombinator.com", "example.com"]);
  });
  test("empty/undefined returns []", () => {
    expect(expandSource(undefined)).toEqual([]);
    expect(expandSource("")).toEqual([]);
  });
  test("all known presets", () => {
    for (const k of Object.keys(SOURCE_PRESETS)) {
      expect(expandSource(k).length).toBeGreaterThan(0);
    }
  });
});

describe("resolveIncludeDomains", () => {
  test("undefined when nothing supplied", () => {
    expect(resolveIncludeDomains(undefined, undefined)).toBeUndefined();
    expect(resolveIncludeDomains(undefined, [])).toBeUndefined();
  });
  test("merges source preset and explicit list", () => {
    const out = resolveIncludeDomains("hn", ["my.example.com"]);
    expect(out).toEqual(["news.ycombinator.com", "my.example.com"]);
  });
  test("dedupes when source and explicit overlap", () => {
    const out = resolveIncludeDomains("hn", ["news.ycombinator.com", "extra.com"]);
    expect(out).toEqual(["news.ycombinator.com", "extra.com"]);
  });
});
