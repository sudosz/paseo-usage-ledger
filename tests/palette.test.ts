import assert from "node:assert/strict";
import test from "node:test";
import { harnessColor, isDarkTheme } from "../client/palette";
import type { PluginTheme } from "@getpaseo/plugin";

function theme(surface0: string, accent: string): PluginTheme {
  return { colors: { surface0, accent } } as unknown as PluginTheme;
}

test("harness colors are stable across accent changes and dark themes", () => {
  const lightA = theme("#ffffff", "#2e7ba8");
  const lightB = theme("#ffffff", "#b45309");
  const dark = theme("#141416", "#a1a1aa");

  assert.equal(isDarkTheme(lightA), false);
  assert.equal(isDarkTheme(dark), true);
  assert.equal(harnessColor(lightA, "opencode"), harnessColor(lightB, "opencode"));
  assert.equal(harnessColor(lightA, "claude"), harnessColor(lightB, "claude"));
  assert.notEqual(harnessColor(lightA, "opencode"), harnessColor(lightA, "claude"));
  assert.notEqual(harnessColor(dark, "opencode"), harnessColor(lightA, "opencode"));
});

test("unknown harnesses still get a deterministic color", () => {
  const light = theme("#ffffff", "#2e7ba8");
  assert.equal(harnessColor(light, "future-harness"), harnessColor(light, "future-harness"));
  assert.notEqual(harnessColor(light, "future-harness"), harnessColor(light, "another-harness"));
});
