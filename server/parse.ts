export type RawEvent = {
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

function positive(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** One Claude Code assistant usage record. Malformed lines return null. */
export function parseClaudeLine(line: string): RawEvent | null {
  let d: Record<string, any>;
  try {
    d = JSON.parse(line) as Record<string, any>;
  } catch {
    return null;
  }
  const u = d.message?.usage ?? d.usage;
  if (!u) return null;
  const model = String(d.message?.model ?? d.model ?? "");
  if (!model || model === "<synthetic>") return null;
  const at = Date.parse(String(d.timestamp ?? d.message?.timestamp ?? ""));
  if (!Number.isFinite(at)) return null;
  return {
    provider: "claude",
    model,
    at,
    input: positive(u.input_tokens),
    cacheRead: positive(u.cache_read_input_tokens),
    cacheWrite: positive(u.cache_creation_input_tokens),
    output: positive(u.output_tokens),
    sessionId: String(d.sessionId ?? d.session_id ?? ""),
  };
}

export type CodexState = {
  model: string;
  provider: string;
  session: string;
};

export function createCodexState(session: string): CodexState {
  return { model: "codex", provider: "codex", session };
}

/**
 * One Codex rollout line. Thread settings update the model/provider state and
 * the next token record inherits them, so the caller threads one state object
 * through a file in order.
 */
export function parseCodexLine(line: string, state: CodexState): RawEvent | null {
  let d: Record<string, any>;
  try {
    d = JSON.parse(line) as Record<string, any>;
  } catch {
    return null;
  }
  const payload = d.payload ?? {};
  if (payload.type === "thread_settings_applied") {
    state.model = String(payload.thread_settings?.model ?? state.model);
    state.provider = String(payload.thread_settings?.model_provider_id ?? state.provider);
  }
  if (d.type !== "token_usage_record" && payload.type !== "token_usage_record") return null;
  const usage = payload.usage ?? d.usage;
  if (!usage) return null;
  const at = Date.parse(String(d.timestamp ?? ""));
  if (!Number.isFinite(at)) return null;
  if (payload.session_id) state.session = String(payload.session_id);
  const cached = positive(usage.cached_input_tokens);
  const cacheWrite = positive(usage.cache_write_input_tokens);
  const totalInput = positive(usage.input_tokens);
  return {
    provider: state.provider,
    model: state.model,
    at,
    input: Math.max(0, totalInput - cached - cacheWrite),
    cacheRead: cached,
    cacheWrite,
    output: positive(usage.output_tokens) + positive(usage.reasoning_output_tokens),
    sessionId: state.session,
  };
}
