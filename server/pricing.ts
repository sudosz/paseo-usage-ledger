/// <reference types="node" />
export type Rate = { input: number; output: number; cacheRead: number; label: string };

/**
 * API-equivalent rates in USD per 1M tokens. These are estimates, not a
 * subscription bill. Unknown models stay unpriced instead of inventing a
 * number; the UI labels them explicitly.
 */
const RATES: Array<{ pattern: RegExp; rate: Rate }> = [
  { pattern: /^claude-opus/i, rate: { input: 15, output: 75, cacheRead: 1.5, label: "Claude Opus" } },
  { pattern: /^claude-sonnet/i, rate: { input: 3, output: 15, cacheRead: 0.3, label: "Claude Sonnet" } },
  { pattern: /^claude-haiku/i, rate: { input: 1, output: 5, cacheRead: 0.1, label: "Claude Haiku" } },
  { pattern: /^deepseek-v4\.1-flash/i, rate: { input: 0.28, output: 0.42, cacheRead: 0.028, label: "DeepSeek V4.1 Flash" } },
  { pattern: /^glm-5\.3$/i, rate: { input: 0.6, output: 2.2, cacheRead: 0.06, label: "GLM 5.3" } },
  { pattern: /^glm-5\.3-flash/i, rate: { input: 0.1, output: 0.4, cacheRead: 0.01, label: "GLM 5.3 Flash" } },
  { pattern: /^gemini-3\.8-flash/i, rate: { input: 0.3, output: 2.5, cacheRead: 0.075, label: "Gemini 3.8 Flash" } },
  { pattern: /^gpt-oss-120b/i, rate: { input: 0.15, output: 0.6, cacheRead: 0.015, label: "GPT-OSS 120B" } },
];

export function rateFor(model: string): Rate | null {
  const name = model.split("/").pop() ?? model;
  return RATES.find(({ pattern }) => pattern.test(name))?.rate ?? null;
}

export function isFree(model: string): boolean {
  return /(?:^|[/:-])free(?:$|[/:-])/i.test(model) || /free$/i.test(model);
}
