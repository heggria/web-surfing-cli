/**
 * wsc command-line entry point.
 *
 * Mirrors the hsctl convention: `--json` is opt-in but auto-on when stdout
 * is not a TTY (so agents/hooks always get JSON). Subcommands return a
 * dict-shaped payload with at least `ok`, `operation`, `returncode`.
 */

import { Command, Option } from "commander";
import * as audit from "./audit.js";
import * as config from "./config.js";
import * as crawl from "./ops/crawl.js";
import * as discover from "./ops/discover.js";
import * as docs from "./ops/docs.js";
import * as fetchOp from "./ops/fetch.js";
import * as plan from "./ops/plan.js";
import * as search from "./ops/search.js";

const VERSION = "0.2.0";

interface GlobalOptions {
  json?: boolean;
  quiet?: boolean;
  noReceipt?: boolean;
  budget?: number;
}

function resolveJson(opts: GlobalOptions): boolean {
  if (opts.json) return true;
  if (process.env.WSC_JSON === "1") return true;
  return process.stdout && process.stdout.isTTY === false;
}

function emit(opts: GlobalOptions, payload: Record<string, unknown>): never {
  if (resolveJson(opts)) {
    process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  } else {
    renderHuman(payload);
  }
  const rc = Number(payload.returncode ?? 0);
  process.exit(rc);
}

function renderHuman(payload: Record<string, unknown>): void {
  const op = String(payload.operation ?? "");
  if (payload.ok === false && payload.error) {
    process.stderr.write(`${payload.error}\n`);
  }
  if (op === "init") {
    const actions = (payload.actions as string[] | undefined) ?? [];
    if (actions.length === 0) console.log("(nothing to do)");
    else for (const a of actions) console.log(a);
    return;
  }
  if (op === "config.doctor") {
    renderDoctor(payload);
    return;
  }
  if (op === "config.disable" || op === "config.enable") {
    console.log(payload.message ?? "");
    return;
  }
  if (op === "receipts.tail") {
    const events = (payload.events as Record<string, unknown>[] | undefined) ?? [];
    if (events.length === 0) {
      console.log("(no audit events)");
      return;
    }
    for (const ev of events) {
      const ts = String(ev.ts ?? "?");
      const evOp = String(ev.op ?? "?").padEnd(14);
      const provider = String(ev.provider ?? "-").padEnd(11);
      const status = String(ev.status ?? "?").padEnd(9);
      const dur = String(ev.duration_ms ?? "?");
      const callId = String(ev.call_id ?? "").slice(0, 8);
      console.log(`${ts}  ${evOp}  ${provider}  ${status}  ${dur}ms  call=${callId}`);
    }
    return;
  }
  if (op === "receipts.summary") {
    renderReceiptsSummary(payload);
    return;
  }
  if (op === "plan.explain") {
    renderPlanExplain(payload);
    return;
  }
  process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
}

function renderDoctor(payload: Record<string, unknown>): void {
  const rows = (payload.providers as Array<Record<string, unknown>>) ?? [];
  console.log(`${"PROVIDER".padEnd(12)} ${"ROLE".padEnd(22)} ${"STATUS".padEnd(10)} KEY?  ENV`);
  console.log("-".repeat(78));
  for (const r of rows) {
    const envKeys = (r.env_keys as string[] | undefined)?.join(",") ?? "-";
    const has = r.has_key ? "yes" : "no ";
    console.log(
      `${String(r.provider).padEnd(12)} ${String(r.role).padEnd(22)} ${String(r.status).padEnd(10)} ${has.padEnd(4)}  ${envKeys || "-"}`,
    );
  }
  const chains = (payload.role_fallback_chains as Record<string, string[]>) ?? {};
  if (Object.keys(chains).length > 0) {
    console.log("\nlive fallback chains:");
    for (const [role, chain] of Object.entries(chains)) {
      console.log(`  ${role.padEnd(22)} → ${chain.length > 0 ? chain.join(" → ") : "(none available)"}`);
    }
  }
  if (!payload.ok) process.stderr.write(`\nhint: ${payload.hint ?? ""}\n`);
}

function renderReceiptsSummary(payload: Record<string, unknown>): void {
  console.log(`summary  scope=${payload.scope ?? "all"}  events=${payload.event_count ?? 0}`);
  for (const [label, key] of [
    ["by op", "by_op"],
    ["by provider", "by_provider"],
    ["by status", "by_status"],
  ] as const) {
    const d = (payload[key] as Record<string, number> | undefined) ?? {};
    if (Object.keys(d).length > 0) {
      console.log(`  ${label}:`);
      for (const [k, v] of Object.entries(d).sort(([, a], [, b]) => b - a)) {
        console.log(`    ${String(v).padStart(5)}  ${k}`);
      }
    }
  }
  if (payload.cost_units_total != null) {
    console.log(`  cost: ${payload.cost_units_total} units, ~$${payload.cost_usd_estimated_total ?? 0}`);
  }
  const byDomain = (payload.by_domain as Record<string, number> | undefined) ?? {};
  if (Object.keys(byDomain).length > 0) {
    console.log("  top domains:");
    for (const [host, n] of Object.entries(byDomain)) {
      console.log(`    ${String(n).padStart(5)}  ${host}`);
    }
  }
  const high = (payload.high_confidence_events as unknown[] | undefined) ?? [];
  if (high.length > 0) console.log(`  high-confidence events: ${high.length}`);
}

function renderPlanExplain(payload: Record<string, unknown>): void {
  const d = (payload.decision as Record<string, unknown> | undefined) ?? {};
  console.log(`query: ${JSON.stringify(payload.query)}`);
  console.log(`intent:        ${d.intent ?? ""}`);
  console.log(`recommend op:  ${d.recommended_op ?? ""}  → provider ${d.recommended_provider ?? ""}`);
  console.log(`confidence:    ${d.confidence ?? ""}  (ambiguous=${d.ambiguous ?? false})`);
  console.log(`rationale:     ${d.rationale ?? ""}`);
  console.log(`search budget: ${d.search_budget ?? ""}`);
  const fired = (d.rules_fired as string[] | undefined) ?? [];
  if (fired.length > 0) {
    console.log("rules fired:");
    for (const line of fired) console.log(`  - ${line}`);
  }
  const why = (d.why_not as Array<{ op: string; reason: string }> | undefined) ?? [];
  if (why.length > 0) {
    console.log("why_not:");
    for (const w of why) console.log(`  - ${w.op}: ${w.reason}`);
  }
  console.log(`\nwould run: ${payload.would_run}`);
}

// --- Commander setup -------------------------------------------------------

const program = new Command();
program
  .name("wsc")
  .description(
    "Unified evidence-acquisition CLI across Context7, Exa, Tavily, Firecrawl, Brave, and DuckDuckGo.",
  )
  .version(VERSION, "-v, --version", "print version and exit")
  .option("--json", "emit machine-readable JSON (auto-on when stdout is not a TTY or WSC_JSON=1)")
  .option("--quiet", "suppress human-mode chatter")
  .option("--no-receipt", "skip audit log write")
  .option("--budget <n>", "override per-task search budget", (v) => Number.parseInt(v, 10));

function getGlobals(): GlobalOptions {
  return program.opts() as GlobalOptions;
}

// init
program
  .command("init")
  .description("create config + state dirs and templates")
  .option("--force", "overwrite existing keys.toml / budget.toml")
  .option("--yes", "non-interactive (no prompts; v0.2 always non-interactive)")
  .action((opts) => {
    emit(getGlobals(), { ...config.init({ force: !!opts.force }) });
  });

// config
const cfg = program.command("config").description("provider availability and kill-switch");
cfg
  .command("doctor")
  .description("show per-provider status and live fallback chains")
  .option("--deep", "run minimal real probe per provider (v0.3)")
  .action((opts) => {
    emit(getGlobals(), { ...config.doctor({ deep: !!opts.deep }) });
  });
cfg
  .command("disable <provider>")
  .description("kill-switch a provider until re-enabled")
  .action((provider) => {
    config.disable(provider);
    emit(getGlobals(), {
      ok: true,
      operation: "config.disable",
      provider,
      message: `disabled ${provider} (run \`wsc config enable ${provider}\` to undo)`,
      returncode: 0,
    });
  });
cfg
  .command("enable <provider>")
  .description("reverse `wsc config disable`")
  .action((provider) => {
    const wasDisabled = config.enable(provider);
    emit(getGlobals(), {
      ok: true,
      operation: "config.enable",
      provider,
      message: wasDisabled ? `re-enabled ${provider}` : `${provider} was not disabled`,
      returncode: 0,
    });
  });

// receipts
const rec = program.command("receipts").description("audit log");
rec
  .command("tail")
  .description("last N receipts")
  .option("--lines <n>", "default 20", (v) => Number.parseInt(v, 10), 20)
  .option("--tool <op>", "filter by op prefix (e.g. fetch, plan)")
  .option("--provider <name>")
  .option("--since <duration>", "duration like 15m, 2h, 7d")
  .action(async (opts) => {
    const result = await audit.tail({
      lines: opts.lines,
      op: opts.tool,
      provider: opts.provider,
      since: opts.since,
    });
    emit(getGlobals(), result as unknown as Record<string, unknown>);
  });
rec
  .command("summary")
  .description("aggregated audit summary")
  .option("--days <n>", "default 0 (all)", (v) => Number.parseInt(v, 10), 0)
  .option("--by-domain", "aggregate by selected URL host")
  .option("--cost", "aggregate cost_units / cost_usd_estimated")
  .option("--high-confidence", "show events with multi_source_evidence ≥ 2")
  .action(async (opts) => {
    const result = await audit.summary({
      days: opts.days,
      byDomain: !!opts.byDomain,
      cost: !!opts.cost,
      highConfidence: !!opts.highConfidence,
    });
    emit(getGlobals(), result as unknown as Record<string, unknown>);
  });

// plan
program
  .command("plan <query>")
  .description("auto-route a query to the right tool")
  .option("--explain", "show route decision without calling providers")
  .addOption(new Option("--prefer <mode>", "fast|deep").choices(["fast", "deep"]))
  .addOption(new Option("--router <name>", "rule|llm").choices(["rule", "llm"]).default("rule"))
  .action(async (query, opts) => {
    const globals = getGlobals();
    if (opts.explain) {
      emit(globals, plan.explain(query, { prefer: opts.prefer, budgetOverride: globals.budget, routerName: opts.router }));
    }
    const result = await plan.run(query, {
      prefer: opts.prefer,
      budgetOverride: globals.budget,
      routerName: opts.router,
      noReceipt: globals.noReceipt,
    });
    emit(globals, result);
  });

// docs
program
  .command("docs <library>")
  .description("fetch official library docs via Context7")
  .option("--topic <topic>")
  .option("--version <ver>")
  .action(async (library, opts) => {
    const result = await docs.run(library, {
      topic: opts.topic,
      version: opts.version,
      noReceipt: getGlobals().noReceipt,
    });
    emit(getGlobals(), result as unknown as Record<string, unknown>);
  });

// discover
program
  .command("discover <query>")
  .description("semantic discovery via Exa")
  .addOption(new Option("--type <kind>", "code|paper|company|people").choices(["code", "paper", "company", "people"]))
  .option("--since <days>", "restrict to last N days", (v) => Number.parseInt(v, 10))
  .option("--num-results <n>", "default 10", (v) => Number.parseInt(v, 10), 10)
  .action(async (query, opts) => {
    const result = await discover.run(query, {
      type: opts.type,
      sinceDays: opts.since,
      numResults: opts.numResults,
      noReceipt: getGlobals().noReceipt,
    });
    emit(getGlobals(), result);
  });

// fetch
program
  .command("fetch <url>")
  .description("clean a known URL via Firecrawl")
  .option("--format <fmt>", "markdown|html (repeatable)", (val: string, prev: string[] = []) => [...prev, val], [] as string[])
  .option("--screenshot")
  .action(async (url, opts) => {
    const result = await fetchOp.run(url, {
      formats: opts.format && opts.format.length > 0 ? opts.format : undefined,
      screenshot: !!opts.screenshot,
      noReceipt: getGlobals().noReceipt,
    });
    emit(getGlobals(), result);
  });

// crawl
program
  .command("crawl <url>")
  .description("crawl a site via Firecrawl (gated)")
  .option("--max-pages <n>", "default 10", (v) => Number.parseInt(v, 10), 10)
  .option("--include-paths <path>", "repeatable", (val: string, prev: string[] = []) => [...prev, val], [] as string[])
  .option("--exclude-paths <path>", "repeatable", (val: string, prev: string[] = []) => [...prev, val], [] as string[])
  .option("--format <fmt>", "repeatable", (val: string, prev: string[] = []) => [...prev, val], [] as string[])
  .option("--apply", "required for crawls of 11–100 pages")
  .option("--i-know-this-burns-credits", "required for crawls > 100 pages")
  .action(async (url, opts) => {
    const result = await crawl.run(url, {
      maxPages: opts.maxPages,
      includePaths: opts.includePaths.length > 0 ? opts.includePaths : undefined,
      excludePaths: opts.excludePaths.length > 0 ? opts.excludePaths : undefined,
      formats: opts.format.length > 0 ? opts.format : undefined,
      apply: !!opts.apply,
      deepApply: !!opts.iKnowThisBurnsCredits,
      noReceipt: getGlobals().noReceipt,
    });
    emit(getGlobals(), result);
  });

// search
program
  .command("search <query>")
  .description("general web search via Tavily")
  .option("--max-results <n>", "default 10", (v) => Number.parseInt(v, 10), 10)
  .addOption(new Option("--time <range>", "day|week|month|year").choices(["day", "week", "month", "year"]))
  .option("--country <code>")
  .action(async (query, opts) => {
    const result = await search.run(query, {
      maxResults: opts.maxResults,
      timeRange: opts.time,
      country: opts.country,
      noReceipt: getGlobals().noReceipt,
    });
    emit(getGlobals(), result);
  });

program.parseAsync().catch((err: unknown) => {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  emit(getGlobals(), {
    ok: false,
    operation: "wsc",
    error: message,
    returncode: 1,
  });
});
