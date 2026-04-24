/**
 * Test setup — call setupTestEnv() at the top of every test file.
 *
 * Bun's lifecycle hooks register in the file where they're called, so we
 * can't just import this module and expect beforeEach/afterEach to fire.
 * Each test file must call setupTestEnv() once.
 */

import { afterEach, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const KEYS_TO_CLEAR = [
  "WSC_CORRELATION_ID",
  "WSC_JSON",
  "WSC_ROUTER",
  "EXA_API_KEY",
  "TAVILY_API_KEY",
  "FIRECRAWL_API_KEY",
  "BRAVE_API_KEY",
  "BRAVE_SEARCH_API_KEY",
  "CONTEXT7_API_KEY",
];

export function setupTestEnv(): void {
  let savedEnv: Record<string, string | undefined> = {};
  let currentRoot: string | undefined;

  beforeEach(() => {
    savedEnv = {};
    for (const k of [
      ...KEYS_TO_CLEAR,
      "WSC_CONFIG_DIR",
      "WSC_STATE_DIR",
      "WSC_CACHE_DIR",
    ]) {
      savedEnv[k] = process.env[k];
    }
    for (const k of KEYS_TO_CLEAR) {
      delete process.env[k];
    }
    currentRoot = mkdtempSync(join(tmpdir(), "wsc-test-"));
    process.env.WSC_CONFIG_DIR = join(currentRoot, "config");
    process.env.WSC_STATE_DIR = join(currentRoot, "state");
    process.env.WSC_CACHE_DIR = join(currentRoot, "cache");
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    if (currentRoot) {
      try {
        rmSync(currentRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      currentRoot = undefined;
    }
  });
}
