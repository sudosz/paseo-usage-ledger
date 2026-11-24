import { test } from "node:test";
import assert from "node:assert/strict";
import { niceScale, sampleCurve } from "../client/chart-scale";

test("nice scale rounds the top and keeps zero", () => {
  assert.deepEqual(niceScale(0), { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] });
  assert.deepEqual(niceScale(100), { max: 100, ticks: [0, 25, 50, 75, 100] });
  assert.deepEqual(niceScale(123), { max: 150, ticks: [0, 50, 100, 150] });
  assert.deepEqual(niceScale(5_290_000_000), {
    max: 6_000_000_000,
    ticks: [0, 2_000_000_000, 4_000_000_000, 6_000_000_000],
  });
});

test("curve sampling keeps endpoints and fills the sampled width", () => {
  const samples = sampleCurve([0, 10, 0], 5).map((value) => Math.round(value));
  assert.deepEqual(samples, [0, 5, 10, 5, 0]);
  assert.equal(sampleCurve([7], 3).length, 3);
  assert.deepEqual(sampleCurve([], 4), []);
  assert.equal(sampleCurve([0, 10], 1).length, 1);
});
