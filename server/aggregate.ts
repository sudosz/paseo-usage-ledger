import { isFree, rateFor } from "./pricing";
import type { RawEvent } from "./parse";

export type Counters = {
  processed: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  cost: number;
  estimatedCost: number;
  pricedTokens: number;
  unpricedTokens: number;
  sessions: Set<string>;
};

export type Event = RawEvent & {
  harnessId: string;
  harnessName: string;
};

type HarnessCounters = Counters & { id: string; name: string };
type ModelCounters = Counters & {
  model: string;
  provider: string;
  harness: string;
  priced: boolean;
};

export type SummaryPoint = {
  at: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  total: number;
  cost: number;
};

export type HarnessPoint = {
  at: number;
  total: number;
  cacheRead: number;
  cost: number;
};

export type HarnessSeries = {
  id: string;
  name: string;
  points: HarnessPoint[];
};

export type LedgerResult = {
  totals: Omit<Counters, "sessions"> & { sessions: number };
  cacheSavingsUsd: number;
  pricedTokens: number;
  unpricedTokens: number;
  series: SummaryPoint[];
  harnessSeries: HarnessSeries[];
  harnesses: Array<Omit<HarnessCounters, "sessions"> & { sessions: number; cachePct: number }>;
  models: Array<Omit<ModelCounters, "sessions"> & { sessions: number; cachePct: number; share: number }>;
};

export function emptyCounters(): Counters {
  return {
    processed: 0,
    input: 0,
    cacheRead: 0,
    cacheWrite: 0,
    output: 0,
    cost: 0,
    estimatedCost: 0,
    pricedTokens: 0,
    unpricedTokens: 0,
    sessions: new Set(),
  };
}

export function cachePct(c: Pick<Counters, "input" | "cacheRead" | "cacheWrite">): number {
  const total = c.input + c.cacheRead + c.cacheWrite;
  return total > 0 ? Math.round((c.cacheRead / total) * 1000) / 10 : 0;
}

/** In-memory aggregation. One pass over events; no per-bucket scans or timers. */
export class Ledger {
  private readonly total = emptyCounters();
  private readonly series = new Map<number, Counters>();
  private readonly harnesses = new Map<string, HarnessCounters>();
  private readonly harnessSeries = new Map<string, Map<number, Counters>>();
  private readonly models = new Map<string, ModelCounters>();
  private cacheSavingsUsd = 0;

  constructor(
    private readonly since: number,
    private readonly bucketMs: number,
    private readonly until = Number.POSITIVE_INFINITY,
  ) {}

  add(event: Event): void {
    if (!Number.isFinite(event.at) || event.at < this.since || event.at > this.until) return;
    const input = Math.max(0, event.input || 0);
    const cacheRead = Math.max(0, event.cacheRead || 0);
    const cacheWrite = Math.max(0, event.cacheWrite || 0);
    const output = Math.max(0, event.output || 0);
    const processed = input + cacheRead + cacheWrite + output;
    if (processed === 0) return;

    const rate = rateFor(event.model);
    const free = isFree(event.model);
    const reported =
      typeof event.cost === "number" && Number.isFinite(event.cost) && event.cost >= 0
        ? event.cost
        : null;
    const priced = reported !== null || rate !== null || free;
    const estimated =
      reported === null && rate
        ? (input * rate.input +
            cacheRead * rate.cacheRead +
            cacheWrite * rate.input +
            output * rate.output) /
          1_000_000
        : 0;
    const cost = reported ?? (free ? 0 : estimated);
    this.cacheSavingsUsd += rate
      ? (cacheRead * Math.max(0, rate.input - rate.cacheRead)) / 1_000_000
      : 0;

    const bucket = Math.floor(event.at / this.bucketMs) * this.bucketMs;
    const bucketCounters = this.series.get(bucket) ?? emptyCounters();
    this.series.set(bucket, bucketCounters);

    const harness =
      this.harnesses.get(event.harnessId) ??
      ({ ...emptyCounters(), id: event.harnessId, name: event.harnessName } as HarnessCounters);
    this.harnesses.set(event.harnessId, harness);

    const harnessBuckets = this.harnessSeries.get(event.harnessId) ?? new Map<number, Counters>();
    const harnessBucket = harnessBuckets.get(bucket) ?? emptyCounters();
    harnessBuckets.set(bucket, harnessBucket);
    this.harnessSeries.set(event.harnessId, harnessBuckets);

    const key = `${event.harnessId}\u0000${event.provider}\u0000${event.model}`;
    const model =
      this.models.get(key) ??
      ({
        ...emptyCounters(),
        model: event.model,
        provider: event.provider,
        harness: event.harnessName,
        priced: true,
      } as ModelCounters);
    this.models.set(key, model);
    if (!priced) model.priced = false;

    for (const target of [this.total, bucketCounters, harness, harnessBucket, model]) {
      target.processed += processed;
      target.input += input;
      target.cacheRead += cacheRead;
      target.cacheWrite += cacheWrite;
      target.output += output;
      target.cost += cost;
      target.estimatedCost += estimated;
      if (priced) target.pricedTokens += processed;
      else target.unpricedTokens += processed;
      if (event.sessionId) target.sessions.add(event.sessionId);
    }
  }

  summary(now = Date.now()): LedgerResult {
    const points: SummaryPoint[] = [];
    const first = Math.floor(this.since / this.bucketMs) * this.bucketMs;
    const last = Math.floor(now / this.bucketMs) * this.bucketMs;
    for (let at = first; at <= last; at += this.bucketMs) {
      const c = this.series.get(at) ?? emptyCounters();
      points.push({
        at,
        input: c.input,
        cacheRead: c.cacheRead,
        cacheWrite: c.cacheWrite,
        output: c.output,
        total: c.processed,
        cost: c.cost,
      });
    }

    const modelTotal = this.total.processed || 1;
    const harnessSeries = [...this.harnesses.values()]
      .sort((a, b) => b.processed - a.processed)
      .map((h) => {
        const buckets = this.harnessSeries.get(h.id) ?? new Map<number, Counters>();
        return {
          id: h.id,
          name: h.name,
          points: points.map((point) => {
            const c = buckets.get(point.at) ?? emptyCounters();
            return {
              at: point.at,
              total: c.processed,
              cacheRead: c.cacheRead,
              cost: c.cost,
            };
          }),
        };
      });

    return {
      totals: { ...this.total, sessions: this.total.sessions.size },
      cacheSavingsUsd: Math.round(this.cacheSavingsUsd * 100) / 100,
      pricedTokens: this.total.pricedTokens,
      unpricedTokens: this.total.unpricedTokens,
      series: points,
      harnessSeries,
      harnesses: [...this.harnesses.values()]
        .map((h) => ({ ...h, sessions: h.sessions.size, cachePct: cachePct(h) }))
        .sort((a, b) => b.processed - a.processed),
      models: [...this.models.values()]
        .map((m) => ({
          ...m,
          sessions: m.sessions.size,
          cachePct: cachePct(m),
          share: Math.round((m.processed / modelTotal) * 1000) / 10,
        }))
        .sort((a, b) => b.processed - a.processed),
    };
  }
}
