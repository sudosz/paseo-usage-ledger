import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { isFree } from "./pricing";
import { Ledger, type LedgerResult } from "./aggregate";
import { createCodexState, parseClaudeLine, parseCodexLine, type RawEvent } from "./parse";
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
const BIFROST_JSON = process.env.BIFROST_USAGE_JSON ?? join(HOME, ".paseo/usage/bifrost.json");

export type LedgerSummary = LedgerResult & {
  generatedAt: number;
  range: Range;
  since: number;
  until: number;
  notes: string[];
};

const fileCache = new Map<string, { mtimeMs: number; size: number; events: RawEvent[] }>();

async function cachedJsonl(
  path: string,
  parse: (line: string) => RawEvent | null,
): Promise<RawEvent[]> {
  const info = await stat(path);
  const hit = fileCache.get(path);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.events;
  const events: RawEvent[] = [];
  const stream = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const event = parse(line);
    if (event) events.push(event);
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
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
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

function opencodeModel(value: string): { provider: string; model: string } {
  try {
    const parsed = JSON.parse(value) as { id?: string; providerID?: string };
    return { provider: parsed.providerID ?? "opencode", model: parsed.id ?? value };
  } catch {
    return { provider: "opencode", model: value };
  }
}

async function loadOpenCode(
  ledger: Ledger,
  since: number,
  notes: string[],
  bifrost: Map<string, { provider: string; model: string }>,
) {
  try {
    const db = new DatabaseSync(OPENCODE_DB, { readOnly: true } as any);
    const rows = db
      .prepare(
        `select id, time_created, time_updated, model, cost, tokens_input, tokens_output, tokens_cache_read, tokens_cache_write
         from session where time_updated >= ? or time_created >= ?`,
      )
      .all(since, since) as Array<Record<string, any>>;
    db.close();
    for (const row of rows) {
      const m = opencodeModel(String(row.model ?? ""));
      const lane = bifrost.get(String(row.id));
      const provider = lane?.provider ?? m.provider;
      const model = lane?.model ?? (m.provider === "bifrost" ? `bifrost/${m.model}` : m.model);
      const reportedCost = Number(row.cost ?? 0);
      ledger.add({
        harnessId: "opencode",
        harnessName: "OpenCode",
        provider,
        model,
        at: Number(row.time_updated ?? row.time_created ?? 0),
        input: Number(row.tokens_input ?? 0),
        cacheRead: Number(row.tokens_cache_read ?? 0),
        cacheWrite: Number(row.tokens_cache_write ?? 0),
        output: Number(row.tokens_output ?? 0),
        cost: reportedCost > 0 || isFree(model) ? reportedCost : null,
        sessionId: String(row.id),
      });
    }
  } catch (error) {
    notes.push(
      `OpenCode database unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
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
      for (const event of await cachedJsonl(path, parseClaudeLine)) {
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
      const state = createCodexState(basename(path, ".jsonl"));
      for (const event of await cachedJsonl(path, (line) => parseCodexLine(line, state))) {
        ledger.add({ ...event, harnessId: "codex", harnessName: "Codex" });
      }
    }
    notes.push(`Codex: ${used} session files in range.`);
  } catch {
    notes.push("Codex session directory unavailable.");
  }
}

async function loadBifrost(
  since: number,
  notes: string[],
): Promise<Map<string, { provider: string; model: string }>> {
  const out = new Map<string, { provider: string; model: string }>();
  try {
    const data = JSON.parse(await readFile(BIFROST_JSON, "utf8")) as
      | { rows?: Array<Record<string, any>> }
      | Array<Record<string, any>>;
    const rows = Array.isArray(data) ? data : (data.rows ?? []);
    for (const row of rows) {
      const session = String(row.session_id ?? row.sessionId ?? "");
      if (!session || out.has(session)) continue;
      if (Number(row.prompt_tokens ?? row.promptTokens ?? 0) <= 0) continue;
      out.set(session, {
        provider: String(row.provider ?? "bifrost"),
        model: String(row.model ?? "unknown"),
      });
    }
    if (out.size) notes.push(`Bifrost snapshot: attributed ${out.size} sessions by their busiest lane.`);
    else notes.push("Bifrost snapshot is empty; using OpenCode provider/model metadata.");
    return out;
  } catch {
    // A direct DB mount is optional; the snapshot is preferred because it does
    // not expose Bifrost's config database to the Paseo container.
  }
  try {
    const db = new DatabaseSync(BIFROST_DB, { readOnly: true } as any);
    const rows = db
      .prepare(
        `select session_id, provider, model, count(*) as n
         from logs where created_at >= ? and session_id is not null and session_id != ''
         group by session_id, provider, model order by n desc`,
      )
      .all(new Date(since).toISOString()) as Array<Record<string, any>>;
    db.close();
    for (const row of rows) {
      if (!out.has(String(row.session_id))) {
        out.set(String(row.session_id), {
          provider: String(row.provider),
          model: String(row.model),
        });
      }
    }
    if (out.size) notes.push(`Bifrost: attributed ${out.size} sessions by their busiest lane.`);
  } catch {
    notes.push("Bifrost attribution unavailable; using OpenCode provider/model metadata.");
  }
  return out;
}

const cache = new Map<Range, { at: number; value: LedgerSummary }>();
const inflight = new Map<Range, Promise<LedgerSummary>>();

/** Drop cached summaries after a turn; the next read scans the new log tail. */
export function invalidateSummaries(): void {
  cache.clear();
}

export async function summary(range: Range, refresh = false): Promise<LedgerSummary> {
  const hit = cache.get(range);
  if (!refresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const running = inflight.get(range);
  if (running) return running;

  const task = (async () => {
    const until = Date.now();
    const since = until - RANGE_MS[range];
    const ledger = new Ledger(since, BUCKET_MS[range], until);
    const notes: string[] = [];
    const bifrost = await loadBifrost(since, notes);
    await loadOpenCode(ledger, since, notes, bifrost);
    await loadClaude(ledger, since, notes);
    await loadCodex(ledger, since, notes);
    notes.push(
      "Cost and cache savings are API-equivalent estimates for priced models; unknown models are labelled Unpriced.",
    );
    notes.push("Scans run on demand and are cached for 60 seconds. No background polling.");
    const value: LedgerSummary = {
      generatedAt: until,
      range,
      since,
      until,
      ...ledger.summary(until),
      notes,
    };
    cache.set(range, { at: Date.now(), value });
    return value;
  })().finally(() => inflight.delete(range));

  inflight.set(range, task);
  return task;
}
