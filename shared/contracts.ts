/// <reference types="node" />
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const ranges = ["24h", "7d", "30d", "90d"] as const;
export const range = z.enum(ranges);
export type Range = z.infer<typeof range>;

export const totals = z.object({
  processed: z.number(),
  input: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  output: z.number(),
  cost: z.number(),
  estimatedCost: z.number(),
  unpricedTokens: z.number(),
  sessions: z.number(),
});

export const point = z.object({
  at: z.number(),
  input: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  output: z.number(),
  total: z.number(),
  cost: z.number(),
});

export const harness = z.object({
  id: z.string(),
  name: z.string(),
  processed: z.number(),
  input: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  output: z.number(),
  cost: z.number(),
  estimatedCost: z.number(),
  pricedTokens: z.number(),
  unpricedTokens: z.number(),
  sessions: z.number(),
  cachePct: z.number(),
});

export const model = z.object({
  model: z.string(),
  provider: z.string(),
  harness: z.string(),
  processed: z.number(),
  input: z.number(),
  cacheRead: z.number(),
  cacheWrite: z.number(),
  output: z.number(),
  cost: z.number(),
  sessions: z.number(),
  priced: z.boolean(),
  cachePct: z.number(),
  share: z.number(),
});

export const summary = defineRpc({
  name: "ledger.summary",
  input: z.object({ range, refresh: z.boolean().optional() }),
  output: z.object({
    generatedAt: z.number(),
    range,
    since: z.number(),
    until: z.number(),
    totals,
    cacheSavingsUsd: z.number(),
    pricedTokens: z.number(),
    unpricedTokens: z.number(),
    series: z.array(point),
    harnesses: z.array(harness),
    models: z.array(model),
    notes: z.array(z.string()),
  }),
});
