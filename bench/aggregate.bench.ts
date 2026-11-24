import { performance } from "node:perf_hooks";
import { Ledger } from "../server/aggregate";
import { createCodexState, parseClaudeLine, parseCodexLine } from "../server/parse";

const ASSERT = process.argv.includes("--assert");
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-11-24T12:00:00.000Z");

function rng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function percentile(values: number[], p: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function bench(name: string, iterations: number, run: (index: number) => void) {
  const samples: number[] = [];
  for (let round = 0; round < 5; round++) {
    const started = performance.now();
    for (let index = 0; index < iterations; index++) run(index);
    samples.push(performance.now() - started);
  }
  const median = percentile(samples, 0.5);
  const perSecond = iterations / (median / 1000);
  console.log(
    `${name.padEnd(26)} ${median.toFixed(1).padStart(8)} ms   ${Math.round(perSecond).toLocaleString().padStart(10)} ops/s   p95 ${percentile(samples, 0.95).toFixed(1)} ms`,
  );
  return perSecond;
}

const claudeLine = JSON.stringify({
  timestamp: "2026-11-24T10:00:00.000Z",
  sessionId: "ses-bench",
  message: {
    model: "claude-sonnet-5-5",
    usage: {
      input_tokens: 4_000,
      cache_read_input_tokens: 90_000,
      cache_creation_input_tokens: 1_500,
      output_tokens: 900,
    },
  },
});
const codexSettings = JSON.stringify({
  type: "event_msg",
  payload: {
    type: "thread_settings_applied",
    thread_settings: { model: "riverai/GLM-5.3", model_provider_id: "bifrost" },
  },
});
const codexLine = JSON.stringify({
  timestamp: "2026-11-24T10:00:00.000Z",
  type: "token_usage_record",
  payload: {
    usage: {
      input_tokens: 8_000,
      cached_input_tokens: 6_000,
      cache_write_input_tokens: 100,
      output_tokens: 700,
      reasoning_output_tokens: 120,
    },
  },
});

const PARSE_ITERATIONS = 20_000;
const claudePerSecond = bench("parse Claude line", PARSE_ITERATIONS, () => {
  parseClaudeLine(claudeLine);
});
const codexPerSecond = bench("parse Codex line", PARSE_ITERATIONS, (index) => {
  const state = createCodexState("rollup");
  if (index % 100 === 0) parseCodexLine(codexSettings, state);
  parseCodexLine(codexLine, state);
});

const EVENTS = 200_000;
const random = rng(7);
const models = [
  ["opencode", "OpenCode", "anthropic", "claude-sonnet-5-5"],
  ["opencode", "OpenCode", "bifrost", "bifrost/code"],
  ["claude", "Claude Code", "claude", "claude-sonnet-5-5"],
  ["codex", "Codex", "bifrost", "riverai/GLM-5.3"],
] as const;
const events = Array.from({ length: EVENTS }, (_, index) => {
  const lane = models[index % models.length];
  return {
    harnessId: lane[0],
    harnessName: lane[1],
    provider: lane[2],
    model: lane[3],
    at: NOW - Math.floor(random() * 30 * DAY),
    input: Math.floor(random() * 5_000),
    cacheRead: Math.floor(random() * 80_000),
    cacheWrite: Math.floor(random() * 1_000),
    output: Math.floor(random() * 2_000),
    cost: lane[0] === "opencode" ? null : undefined,
    sessionId: `ses-${index % 5_000}`,
  };
});

const ledger = new Ledger(NOW - 30 * DAY, DAY, NOW);
const heapBefore = process.memoryUsage().heapUsed;
const aggregateStarted = performance.now();
for (const event of events) ledger.add(event);
const aggregateMs = performance.now() - aggregateStarted;
const heapAfter = process.memoryUsage().heapUsed;
const aggregatePerSecond = EVENTS / (aggregateMs / 1000);
console.log(
  `${"aggregate 200k events".padEnd(26)} ${aggregateMs.toFixed(1).padStart(8)} ms   ${Math.round(aggregatePerSecond).toLocaleString().padStart(10)} ops/s`,
);

const summaryStarted = performance.now();
const result = ledger.summary(NOW);
const summaryMs = performance.now() - summaryStarted;
console.log(
  `${"summarize 200k events".padEnd(26)} ${summaryMs.toFixed(1).padStart(8)} ms   ${String(result.series.length).padStart(10)} buckets`,
);
console.log(
  `peak heap delta            ${((heapAfter - heapBefore) / 1024 / 1024).toFixed(1).padStart(8)} MiB   ${String(result.models.length).padStart(10)} models`,
);

const failures: string[] = [];
if (claudePerSecond < 50_000) failures.push(`Claude parse ${Math.round(claudePerSecond)} ops/s < 50k`);
if (codexPerSecond < 50_000) failures.push(`Codex parse ${Math.round(codexPerSecond)} ops/s < 50k`);
if (aggregatePerSecond < 150_000) {
  failures.push(`aggregation ${Math.round(aggregatePerSecond)} ops/s < 150k`);
}
if (summaryMs > 50) failures.push(`summary ${summaryMs.toFixed(1)} ms > 50 ms`);
if (heapAfter - heapBefore > 60 * 1024 * 1024) {
  failures.push(`heap delta ${((heapAfter - heapBefore) / 1024 / 1024).toFixed(1)} MiB > 60 MiB`);
}
if (result.totals.processed <= 0) failures.push("summary produced no tokens");

if (ASSERT && failures.length > 0) {
  console.error(`\nbenchmark assertions failed:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (failures.length > 0) {
  console.warn(`\nwarnings (not asserted):\n- ${failures.join("\n- ")}`);
}
