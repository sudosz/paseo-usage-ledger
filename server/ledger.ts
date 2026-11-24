/// <reference types="node" />
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isFree, rateFor } from "./pricing";
import type { Range } from "../shared/contracts";

const RANGE_MS: Record<Range, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "90d": 90 * 24 * 60 * 60 * 1000,
};
const BUCKET_MS: Record<Range, number> = {
  "24h": 60 * 60 * 1000,
  "7d": 6 * 60 * 60 * 1000,
  "30d": 24 * 60 * 60 * 1000,
  "90d": 24 * 60 * 60 * 1000,
};
const TTL_MS = 60_000;
const HOME = homedir();
const OPENCODE_DB = process.env.OPENCODE_DB ?? join(HOME, ".local/share/opencode/opencode.db");
const CLAUDE_PROJECTS = join(process.env.CLAUDE_CONFIG_DIR ?? join(HOME, ".claude"), "projects");
const CODEX_SESSIONS = join(process.env.CODEX_HOME ?? join(HOME, ".codex"), "sessions");
const BIFROST_DB = process.env.BIFROST_LOG_DB ?? "/opt/bifrost/data/logs.db";

type Counters = {
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
type HarnessCounters = Counters & { id: string; name: string };
type ModelCounters = Counters & {
  model: string;
  provider: string;
  harness: string;
  priced: boolean;
};
type Event = {
  harnessId: string;
  harnessName: string;
  provider: string;
  model: string;
  at: number;
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
  cost?: number | null;
  sessionId?: string;
};
export type LedgerSummary = {
  generatedAt: number;
  range: Range;
  since: number;
  until: number;
  totals: Omit<Counters, "sessions"> & { sessions: number };
  cacheSavingsUsd: number;
  pricedTokens: number;
  unpricedTokens: number;
  series: Array<{ at: number; input: number; cacheRead: number; cacheWrite: number; output: number; total: number; cost: number }>;
  harnesses: Array<Omit<HarnessCounters, "sessions"> & { sessions: number; cachePct: number }>;
  models: Array<Omit<ModelCounters, "sessions"> & { sessions: number; cachePct: number; share: number }>;
  notes: string[];
};

function empty(): Counters {
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

function cachePct(c: Pick<Counters, "input" | "cacheRead" | "cacheWrite">) {
  const total = c.input + c.cacheRead + c.cacheWrite;
  return total > 0 ? Math.round((c.cacheRead / total) * 1000) / 10 : 0;
}

class Ledger {
  total = empty();
  series = new Map<number, Counters>();
  harnesses = new Map<string, HarnessCounters>();
  models = new Map<string, ModelCounters>();
  cacheSavingsUsd = 0;

  constructor(
    private readonly since: number,
    private readonly bucketMs: number,
  ) {}

  add(event: Event) {
    if (event.at < this.since || event.at > Date.now()) return;
    if (!Number.isFinite(event.at)) return;
    const input = Math.max(0, event.input || 0);
    const cacheRead = Math.max(0, event.cacheRead || 0);
    const cacheWrite = Math.max(0, event.cacheWrite || 0);
    const output = Math.max(0, event.output || 0);
    const processed = input + cacheRead + cacheWrite + output;
    if (processed === 0) return;
    const rate = rateFor(event.model);
    const free = isFree(event.model);
    const reported = typeof event.cost === "number" && Number.isFinite(event.cost) && event.cost >= 0 ? event.cost : null;
    const priced = reported !== null || rate !== null || free;
    const estimated = reported === null && rate
      ? (input * rate.input + cacheRead * rate.cacheRead + cacheWrite * rate.input + output * rate.output) / 1_000_000
      : 0;
    const cost = reported ?? (free ? 0 : estimated);
    const savings = rate ? (cacheRead * Math.max(0, rate.input - rate.cacheRead)) / 1_000_000 : 0;
    this.cacheSavingsUsd += savings;

    const bucket = Math.floor(event.at / this.bucketMs) * this.bucketMs;
    const targets = [this.total, this.series.get(bucket) ?? empty()];
    this.series.set(bucket, targets[1]);
    const harness = this.harnesses.get(event.harnessId) ?? {
      ...empty(),
      id: event.harnessId,
      name: event.harnessName,
    };
    this.harnesses.set(event.harnessId, harness);
    const key = `${event.harnessId}\u0000${event.provider}\u0000${event.model}`;
    const model = this.models.get(key) ?? {
      ...empty(),
      model: event.model,
      provider: event.provider,
      harness: event.harnessName,
      priced: true,
    };
    this.models.set(key, model);
    targets.push(harness, model);

    for (const target of targets) {
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
    if (!priced) model.priced = false;
  }

  summary(): Omit<LedgerSummary, "generatedAt" | "range" | "since" | "until" | "notes"> {
    const points = [];
    const first = Math.floor(this.since / this.bucketMs) * this.bucketMs;
    const last = Math.floor(Date.now() / this.bucketMs) * this.bucketMs;
    for (let at = first; at <= last; at += this.bucketMs) {
      const c = this.series.get(at) ?? empty();
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
    return {
      totals: { ...this.total, sessions: this.total.sessions.size },
      cacheSavingsUsd: Math.round(this.cacheSavingsUsd * 100) / 100,
      pricedTokens: this.total.pricedTokens,
      unpricedTokens: this.total.unpricedTokens,
      series: points,
      harnesses: [...this.harnesses.values()]
        .map(h => ({ ...h, sessions: h.sessions.size, cachePct: cachePct(h) }))
        .sort((a, b) => b.processed - a.processed),
      models: [...this.models.values()]
        .map(m => ({
          ...m,
          sessions: m.sessions.size,
          cachePct: cachePct(m),
          share: Math.round((m.processed / modelTotal) * 1000) / 10,
        }))
        .sort((a, b) => b.processed - a.processed),
    };
  }
}

type RawEvent = Omit<Event, "harnessId" | "harnessName">;
const fileCache = new Map<string, { mtimeMs: number; size: number; events: RawEvent[] }>();

async function cachedJsonl(path: string, parse: (line: string) => RawEvent[]): Promise<RawEvent[]> {
  const info = await stat(path);
  const hit = fileCache.get(path);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.events;
  const events: RawEvent[] = [];
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try { events.push(...parse(line)); } catch {}
  }
  fileCache.set(path, { mtimeMs: info.mtimeMs, size: info.size, events });
  return events;
}

async function filesUnder(root: string): Promise<string[]> {
  const out: string[] = [];
  let dirs: string[] = [root];
  while (dirs.length) {
    const next: string[] = [];
    for (const dir of dirs) {
      let entries;
      try { entries = await readdir(dir, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) next.push(path);
        else if (entry.isFile() && entry.name.endsWith(".jsonl")) out.push(path);
      }
    }
    dirs = next;
  }
  return out;
}

function parseClaude(line: string): RawEvent[] {
  const d = JSON.parse(line) as Record<string, any>;
  const u = d.message?.usage ?? d.usage;
  if (!u) return [];
  const model = String(d.message?.model ?? d.model ?? "");
  if (!model || model === "<synthetic>") return [];
  const at = Date.parse(String(d.timestamp ?? d.message?.timestamp ?? ""));
  if (!Number.isFinite(at)) return [];
  return [{
    provider: "claude",
    model,
    at,
    input: Number(u.input_tokens ?? 0),
    cacheRead: Number(u.cache_read_input_tokens ?? 0),
    cacheWrite: Number(u.cache_creation_input_tokens ?? 0),
    output: Number(u.output_tokens ?? 0),
    sessionId: String(d.sessionId ?? d.session_id ?? ""),
  }];
}

async function parseCodexFile(path: string): Promise<RawEvent[]> {
  const info = await stat(path);
  const hit = fileCache.get(path);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.events;
  const events: RawEvent[] = [];
  let model = "codex";
  let provider = "codex";
  let session = basename(path, ".jsonl");
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line) as Record<string, any>;
      const payload = d.payload ?? {};
      if (payload.type === "thread_settings_applied") {
        model = String(payload.thread_settings?.model ?? model);
        provider = String(payload.thread_settings?.model_provider_id ?? provider);
      }
      if (d.type !== "token_usage_record" && payload.type !== "token_usage_record") continue;
      const usage = payload.usage ?? d.usage;
      if (!usage) continue;
      const cached = Number(usage.cached_input_tokens ?? 0);
      const cacheWrite = Number(usage.cache_write_input_tokens ?? 0);
      const totalInput = Number(usage.input_tokens ?? 0);
      const at = Date.parse(String(d.timestamp ?? ""));
      if (!Number.isFinite(at)) continue;
      session = String(payload.session_id ?? session);
      events.push({
        provider,
        model,
        at,
        input: Math.max(0, totalInput - cached - cacheWrite),
        cacheRead: cached,
        cacheWrite,
        output: Number(usage.output_tokens ?? 0) + Number(usage.reasoning_output_tokens ?? 0),
        sessionId: session,
      });
    } catch {}
  }
  fileCache.set(path, { mtimeMs: info.mtimeMs, size: info.size, events });
  return events;
}

function opencodeModel(value: string): { provider: string; model: string } {
  try {
    const parsed = JSON.parse(value) as { id?: string; providerID?: string };
    return { provider: parsed.providerID ?? "opencode", model: parsed.id ?? value };
  } catch {
    return { provider: "opencode", model: value };
  }
}

async function loadOpenCode(ledger: Ledger, since: number, notes: string[], bifrost: Map<string, { provider: string; model: string }>) {
  try {
    const db = new DatabaseSync(OPENCODE_DB, { readOnly: true } as any);
    const rows = db.prepare(
      `select id, time_created, time_updated, model, cost, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write
       from session where time_updated >= ? or time_created >= ?`,
    ).all(since, since) as Array<Record<string, any>>;
    db.close();
    for (const row of rows) {
      const m = opencodeModel(String(row.model ?? ""));
      const lane = bifrost.get(String(row.id));
      ledger.add({
        harnessId: "opencode",
        harnessName: "OpenCode",
        provider: lane?.provider ?? m.provider,
        model: lane?.model ?? m.model,
        at: Number(row.time_updated ?? row.time_created ?? 0),
        input: Number(row.tokens_input ?? 0),
        cacheRead: Number(row.tokens_cache_read ?? 0),
        cacheWrite: Number(row.tokens_cache_write ?? 0),
        output: Number(row.tokens_output ?? 0),
        cost: Number(row.cost ?? 0),
        sessionId: String(row.id),
      });
    }
  } catch (error) {
    notes.push(`OpenCode database unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function loadClaude(ledger: Ledger, since: number, notes: string[]) {
  try {
    const files = await filesUnder(CLAUDE_PROJECTS);
    let used = 0;
    for (const path of files) {
      const info = await stat(path).catch(() => null);
      if (!info || info.mtimeMs < since - 86_400_000 || info.size === 0) continue;
      used++;
      for (const event of await cachedJsonl(path, parseClaude)) {
        ledger.add({ ...event, harnessId: "claude", harnessName: "Claude Code" });
      }
    }
    notes.push(`Claude Code: ${used} session files in range.`);
  } catch {
    notes.push("Claude Code history directory unavailable.");
  }
}

async function loadCodex(ledger: Ledger, since: number, notes: string[]) {
  try {
    const files = await filesUnder(CODEX_SESSIONS);
    let used = 0;
    for (const path of files) {
      const info = await stat(path).catch(() => null);
      if (!info || info.mtimeMs < since - 86_400_000 || info.size === 0) continue;
      used++;
      for (const event of await parseCodexFile(path)) {
        ledger.add({ ...event, harnessId: "codex", harnessName: "Codex" });
      }
    }
    notes.push(`Codex: ${used} session files in range.`);
  } catch {
    notes.push("Codex session directory unavailable.");
  }
}

async function loadBifrost(since: number, notes: string[]): Promise<Map<string, { provider: string; model: string }>> {
  const out = new Map<string, { provider: string; model: string }>();
  try {
    const db = new DatabaseSync(BIFROST_DB, { readOnly: true } as any);
    const rows = db.prepare(
      `select session_id, provider, model, count(*) as n
       from logs where created_at >= ? and session_id is not null and session_id != ''
       group by session_id, provider, model order by n desc`,
    ).all(new Date(since).toISOString()) as Array<Record<string, any>>;
    db.close();
    for (const row of rows) {
      if (!out.has(String(row.session_id))) out.set(String(row.session_id), { provider: String(row.provider), model: String(row.model) });
    }
    if (out.size) notes.push(`Bifrost: attributed ${out.size} sessions by their busiest lane.`);
  } catch {
    notes.push("Bifrost log DB unavailable; using OpenCode provider/model metadata.");
  }
  return out;
}

const cache = new Map<Range, { at: number; value: LedgerSummary }>();
const inflight = new Map<Range, Promise<LedgerSummary>>();

export async function summary(range: Range, refresh = false): Promise<LedgerSummary> {
  const hit = cache.get(range);
  if (!refresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const running = inflight.get(range);
  if (running) return running;
  const task = (async () => {
    const until = Date.now();
    const since = until - RANGE_MS[range];
    const ledger = new Ledger(since, BUCKET_MS[range]);
    const notes: string[] = [];
    const bifrost = await loadBifrost(since, notes);
    await loadOpenCode(ledger, since, notes, bifrost);
    await loadClaude(ledger, since, notes);
    await loadCodex(ledger, since, notes);
    notes.push("Cost and cache savings are API-equivalent estimates for priced models; unknown models are labelled Unpriced.");
    notes.push("Scans run on demand and are cached for 60 seconds. No background polling.");
    const value: LedgerSummary = {
      generatedAt: until,
      range,
      since,
      until,
      ...ledger.summary(),
      notes,
    };
    cache.set(range, { at: Date.now(), value });
    return value;
  })().finally(() => inflight.delete(range));
  inflight.set(range, task);
  return task;
}
