import { test } from "node:test";
import assert from "node:assert/strict";
import { formatTokens, formatUsd } from "../client/format";
import { rateFor } from "../server/pricing";

test("token formatting is compact and deterministic", () => {
  assert.equal(formatTokens(999), "999");
  assert.equal(formatTokens(1_500), "1.5K");
  assert.equal(formatTokens(16_100_000), "16.1M");
  assert.equal(formatTokens(10_100_000_000), "10.10B");
});

test("cost formatting keeps small values visible", () => {
  assert.equal(formatUsd(0), "$0");
  assert.equal(formatUsd(0.0012), "<$0.01");
  assert.equal(formatUsd(12.345), "$12.35");
  assert.equal(formatUsd(3107.62), "$3.11K");
});

test("known models are priced and unknown models stay unpriced", () => {
  assert.ok(rateFor("claude-opus-5-5"));
  assert.ok(rateFor("claude-sonnet-5-5"));
  assert.deepEqual(rateFor("deepseek/deepseek-flash"), {
    input: 0.3,
    output: 1.2,
    cacheRead: 0.006,
    label: "DeepSeek V4.1 Flash (Official)",
  });
  assert.deepEqual(rateFor("bifrost/deepseek-official/deepseek-v4-pro"), {
    input: 1.32,
    output: 3.96,
    cacheRead: 0.044,
    label: "DeepSeek V4 Pro (Official)",
  });
  assert.equal(rateFor("bifrost/code"), null);
});
