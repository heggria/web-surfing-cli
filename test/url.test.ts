import { describe, expect, test } from "bun:test";
import { setupTestEnv } from "./_setup.js";

setupTestEnv();
import { normalizeUrl, redactEach, redactUrl } from "../src/_url.js";

describe("redactUrl", () => {
  test("strips token", () => {
    const out = redactUrl("https://example.com/path?token=SECRET&q=hello");
    expect(out).not.toContain("SECRET");
    expect(out).toContain("token=***");
    expect(out).toContain("q=hello");
  });

  test("preserves normal query params", () => {
    const out = redactUrl("https://duckduckgo.com/?q=anthropic+claude&format=json");
    expect(out).toContain("anthropic");
    expect(out).toContain("format=json");
  });

  test("handles multiple secret keys", () => {
    const out = redactUrl("https://api.example.com/x?api_key=A&signature=B&access_token=C&page=1");
    for (const forbidden of ["=A", "=B", "=C"]) expect(out).not.toContain(forbidden);
    expect(out).toContain("page=1");
  });

  test("is case-insensitive on keys", () => {
    const out = redactUrl("https://example.com/?Token=X&Q=ok");
    expect(out).not.toContain("X");
    expect(out).toContain("ok");
  });

  test("passes through when no query", () => {
    expect(redactUrl("https://example.com/path")).toBe("https://example.com/path");
  });

  test("passes through non-URLs", () => {
    expect(redactUrl("")).toBe("");
    expect(redactUrl("not a url")).toBe("not a url");
  });
});

describe("normalizeUrl", () => {
  test("lowercases host and drops default port", () => {
    expect(normalizeUrl("HTTPS://Example.COM:443/Path?b=1&a=2")).toBe(
      "https://example.com/Path?a=2&b=1",
    );
  });

  test("drops tracking params", () => {
    const out = normalizeUrl("https://example.com/x?utm_source=z&q=hello&fbclid=abc");
    expect(out).not.toContain("utm_source");
    expect(out).not.toContain("fbclid");
    expect(out).toContain("q=hello");
  });

  test("drops fragment", () => {
    expect(normalizeUrl("https://example.com/x#section")).toBe("https://example.com/x");
  });

  test("keeps path case", () => {
    expect(normalizeUrl("https://example.com/Path/Sub")).toContain("/Path/Sub");
  });

  test("handles no path", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com/");
  });
});

describe("redactEach", () => {
  test("maps over an array", () => {
    const out = redactEach(["https://x.com/?token=A", "https://y.com/?q=hi"]);
    expect(out[0]).not.toContain("A");
    expect(out[1]).toContain("q=hi");
  });
});
