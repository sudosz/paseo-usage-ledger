import { test } from "node:test";
import assert from "node:assert/strict";
import { Ledger, cachePct, emptyCounters } from "../server/aggregate";

const BASE = {
  harnessId: "opencode",
  harnessName: "OpenCode",
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  at: 1_000,
  input: 0,
  cacheRead: 0,
  cacheWrite: 0,
  output: 0,
} as const;

test("empty counters are all zero and have no sessions", () => {
  const counters = emptyCounters();
  assert.equal(counters.processed, 0);
  assert.equal(counters.sessions.size, 0);
  assert.equal(cachePct(counters), 0);
});

test("aggregation estimates cost, savings, shares and unpriced usage", () => {
  const ledger = new Ledger(0, 1_000, 10_000);
  ledger.add({
    ...BASE,
    input: 1_000_000,
    cacheRead: 2_000_000,
    output: 1_000_000,
    cost: null,
    sessionId: "ses-1",
  });
  ledger.add({
    ...BASE,
    harnessId: "opencode",
    harnessName: "OpenCode",
    provider: "bifrost",
    model: "bifrost/code",
    input: 100,
    cacheRead: 900,
    output: 10,
    cost: null,
    sessionId: "ses-2",
  });
  ledger.add({
    ...BASE,
    at: 20_000,
    input: 9_999_999,
    sessionId: "outside",
  });

  const result = ledger.summary(5_000);
  assert.equal(result.totals.processed, 4_001_010);
  assert.equal(result.totals.input, 1_000_100);
  assert.equal(result.totals.cacheRead, 2_000_900);
  assert.equal(result.totals.output, 1_000_010);
  assert.equal(result.totals.sessions, 2);
  assert.equal(result.totals.cost, 18.6);
  assert.equal(result.cacheSavingsUsd, 5.4);
  assert.equal(result.pricedTokens, 4_000_000);
  assert.equal(result.unpricedTokens, 1_010);
  assert.equal(result.series.length, 6);
  assert.equal(result.series[1].total, 4_001_010);
  assert.equal(result.series[5].total, 0);

  const opencode = result.harnesses[0];
  assert.equal(opencode.name, "OpenCode");
  assert.equal(opencode.cachePct, 66.7);
  assert.equal(opencode.sessions, 2);

  const unpriced = result.models.find((model) => model.model === "bifrost/code");
  assert.equal(unpriced?.priced, false);
  assert.equal(unpriced?.cost, 0);

  const series = result.harnessSeries[0];
  assert.equal(series.name, "OpenCode");
  assert.equal(series.points[1].total, 4_001_010);
  assert.equal(series.points[1].cacheRead, 2_000_900);
  assert.equal(series.points[0].total, 0);
});

test("reported costs win over estimated rates", () => {
  const ledger = new Ledger(0, 1_000, 10_000);
  ledger.add({
    ...BASE,
    input: 1_000_000,
    output: 1_000_000,
    cost: 0.42,
    sessionId: "ses-1",
  });
  const result = ledger.summary(5_000);
  assert.equal(result.totals.cost, 0.42);
  assert.equal(result.totals.estimatedCost, 0);
  assert.equal(result.models[0].priced, true);
  assert.equal(result.models[0].share, 100);
});

test("zero-cost free models stay priced", () => {
  const ledger = new Ledger(0, 1_000, 10_000);
  ledger.add({
    ...BASE,
    model: "gpt-oss-120b:free",
    input: 500,
    cost: null,
  });
  const result = ledger.summary(5_000);
  assert.equal(result.totals.cost, 0);
  assert.equal(result.unpricedTokens, 0);
  assert.equal(result.models[0].priced, true);
});
