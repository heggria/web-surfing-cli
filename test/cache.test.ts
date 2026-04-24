/** Cache module tests — key determinism, TTL, stats, clear. */

import { describe, expect, test } from "bun:test";
import { setupTestEnv } from "./_setup.js";

setupTestEnv();
import * as cache from "../src/cache.js";

describe("cacheKey", () => {
  test("is deterministic across param key order", () => {
    const a = cache.cacheKey({
      op: "search",
      query: "claude opus",
      params: { max_results: 10, time_range: "week", country: null },
    });
    const b = cache.cacheKey({
      op: "search",
      query: "claude opus",
      params: { country: null, time_range: "week", max_results: 10 },
    });
    expect(a).toBe(b);
  });
  test("differs by query", () => {
    const a = cache.cacheKey({ op: "search", query: "x", params: {} });
    const b = cache.cacheKey({ op: "search", query: "y", params: {} });
    expect(a).not.toBe(b);
  });
  test("differs by op", () => {
    const a = cache.cacheKey({ op: "search", query: "x", params: {} });
    const b = cache.cacheKey({ op: "discover", query: "x", params: {} });
    expect(a).not.toBe(b);
  });
  test("differs by params", () => {
    const a = cache.cacheKey({ op: "search", query: "x", params: { time_range: "day" } });
    const b = cache.cacheKey({ op: "search", query: "x", params: { time_range: "week" } });
    expect(a).not.toBe(b);
  });
});

describe("get/set roundtrip", () => {
  test("set then get returns the value", async () => {
    const key = cache.cacheKey({ op: "search", query: "hello", params: {} });
    await cache.set(key, { provider: "tavily", results: [{ url: "https://a.com" }] }, {
      ttlSec: 60,
      op: "search",
      provider: "tavily",
    });
    const got = await cache.get<{ provider: string; results: Array<{ url: string }> }>(key, 60);
    expect(got).not.toBeNull();
    expect(got!.provider).toBe("tavily");
    expect(got!.results[0]!.url).toBe("https://a.com");
  });
  test("missing key returns null", async () => {
    const got = await cache.get(cache.cacheKey({ op: "search", query: "never-set", params: {} }), 60);
    expect(got).toBeNull();
  });
  test("noCache disables both read and write", async () => {
    const key = cache.cacheKey({ op: "search", query: "skip-me", params: {} });
    await cache.set(key, { x: 1 }, { ttlSec: 60, op: "search", provider: "tavily", noCache: true });
    const got = await cache.get(key, 60);
    expect(got).toBeNull();
  });
  test("WSC_NO_CACHE=1 disables get", async () => {
    const key = cache.cacheKey({ op: "search", query: "env-disable", params: {} });
    await cache.set(key, { x: 1 }, { ttlSec: 60, op: "search", provider: "tavily" });
    process.env.WSC_NO_CACHE = "1";
    try {
      const got = await cache.get(key, 60);
      expect(got).toBeNull();
    } finally {
      delete process.env.WSC_NO_CACHE;
    }
  });
});

describe("expiry", () => {
  test("expired entry returns null and is invisible to get", async () => {
    const key = cache.cacheKey({ op: "search", query: "expire-me", params: {} });
    await cache.set(key, { x: 1 }, { ttlSec: 1, op: "search", provider: "tavily" });
    // Force the cached_at into the past by writing directly.
    // Simpler: just sleep for slightly more than 1s.
    await new Promise((r) => setTimeout(r, 1100));
    const got = await cache.get(key, 1);
    expect(got).toBeNull();
  });
  test("ttlSec=0 means no caching", async () => {
    const key = cache.cacheKey({ op: "search", query: "zero-ttl", params: {} });
    await cache.set(key, { x: 1 }, { ttlSec: 0, op: "search", provider: "tavily" });
    const got = await cache.get(key, 0);
    expect(got).toBeNull();
  });
});

describe("stats", () => {
  test("reports counts and sizes", async () => {
    await cache.set(cache.cacheKey({ op: "search", query: "a", params: {} }), { v: "a" }, {
      ttlSec: 60,
      op: "search",
      provider: "tavily",
    });
    await cache.set(cache.cacheKey({ op: "discover", query: "b", params: {} }), { v: "b" }, {
      ttlSec: 60,
      op: "discover",
      provider: "exa",
    });
    const s = cache.stats();
    expect(s.count).toBe(2);
    expect(s.size_bytes).toBeGreaterThan(0);
    expect(s.by_op.search).toBe(1);
    expect(s.by_op.discover).toBe(1);
    expect(s.by_provider.tavily).toBe(1);
    expect(s.by_provider.exa).toBe(1);
  });
  test("empty cache has count=0", () => {
    const s = cache.stats();
    expect(s.count).toBe(0);
    expect(s.size_bytes).toBe(0);
  });
});

describe("clear", () => {
  test("refuses to clear all without --all or filter", () => {
    const r = cache.clear();
    expect(r.ok).toBe(false);
    expect(r.returncode).toBe(2);
    expect(r.error).toContain("--all");
  });
  test("--all removes everything", async () => {
    await cache.set(cache.cacheKey({ op: "search", query: "a", params: {} }), { v: "a" }, {
      ttlSec: 60,
      op: "search",
      provider: "tavily",
    });
    await cache.set(cache.cacheKey({ op: "discover", query: "b", params: {} }), { v: "b" }, {
      ttlSec: 60,
      op: "discover",
      provider: "exa",
    });
    const r = cache.clear({ all: true });
    expect(r.ok).toBe(true);
    expect(r.removed_count).toBe(2);
    const s = cache.stats();
    expect(s.count).toBe(0);
  });
  test("--op filters", async () => {
    await cache.set(cache.cacheKey({ op: "search", query: "a", params: {} }), { v: "a" }, {
      ttlSec: 60,
      op: "search",
      provider: "tavily",
    });
    await cache.set(cache.cacheKey({ op: "discover", query: "b", params: {} }), { v: "b" }, {
      ttlSec: 60,
      op: "discover",
      provider: "exa",
    });
    const r = cache.clear({ op: "search" });
    expect(r.ok).toBe(true);
    expect(r.removed_count).toBe(1);
    const s = cache.stats();
    expect(s.count).toBe(1);
    expect(s.by_op.discover).toBe(1);
  });
  test("--provider filters", async () => {
    await cache.set(cache.cacheKey({ op: "search", query: "a", params: {} }), { v: "a" }, {
      ttlSec: 60,
      op: "search",
      provider: "tavily",
    });
    await cache.set(cache.cacheKey({ op: "search", query: "b", params: {} }), { v: "b" }, {
      ttlSec: 60,
      op: "search",
      provider: "brave",
    });
    const r = cache.clear({ provider: "tavily" });
    expect(r.removed_count).toBe(1);
    const s = cache.stats();
    expect(s.by_provider.brave).toBe(1);
  });
  test("--expired-only removes only expired", async () => {
    const expiredKey = cache.cacheKey({ op: "search", query: "old", params: {} });
    await cache.set(expiredKey, { v: "old" }, { ttlSec: 1, op: "search", provider: "tavily" });
    await new Promise((r) => setTimeout(r, 1100));
    const freshKey = cache.cacheKey({ op: "search", query: "fresh", params: {} });
    await cache.set(freshKey, { v: "fresh" }, { ttlSec: 60, op: "search", provider: "tavily" });
    const r = cache.clear({ expiredOnly: true });
    expect(r.removed_count).toBe(1);
    const stillFresh = await cache.get(freshKey, 60);
    expect(stillFresh).not.toBeNull();
  });
});

describe("parseDurationSec", () => {
  test("parses 30s", () => expect(cache.parseDurationSec("30s")).toBe(30));
  test("parses 5m", () => expect(cache.parseDurationSec("5m")).toBe(300));
  test("parses 2h", () => expect(cache.parseDurationSec("2h")).toBe(7200));
  test("parses 1d", () => expect(cache.parseDurationSec("1d")).toBe(86400));
  test("rejects bad units", () => {
    expect(() => cache.parseDurationSec("5x")).toThrow();
  });
  test("rejects empty", () => {
    expect(() => cache.parseDurationSec("")).toThrow();
  });
});
