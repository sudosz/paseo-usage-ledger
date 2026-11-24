import { test } from "node:test";
import assert from "node:assert/strict";
import { createCodexState, parseClaudeLine, parseCodexLine } from "../server/parse";

test("Claude usage records keep cache read and cache write separate", () => {
  const event = parseClaudeLine(
    JSON.stringify({
      timestamp: "2026-11-24T10:00:00.000Z",
      sessionId: "ses-1",
      message: {
        model: "claude-sonnet-5-5",
        usage: {
          input_tokens: 12,
          cache_read_input_tokens: 34,
          cache_creation_input_tokens: 56,
          output_tokens: 78,
        },
      },
    }),
  );
  assert.deepEqual(event, {
    provider: "claude",
    model: "claude-sonnet-5-5",
    at: Date.parse("2026-11-24T10:00:00.000Z"),
    input: 12,
    cacheRead: 34,
    cacheWrite: 56,
    output: 78,
    sessionId: "ses-1",
  });
});

test("Claude parser ignores synthetic models and malformed lines", () => {
  assert.equal(
    parseClaudeLine(
      JSON.stringify({
        timestamp: "2026-11-24T10:00:00.000Z",
        message: { model: "<synthetic>", usage: { input_tokens: 1 } },
      }),
    ),
    null,
  );
  assert.equal(parseClaudeLine("{not json"), null);
  assert.equal(parseClaudeLine(JSON.stringify({ type: "assistant" })), null);
});

test("Codex thread settings carry into later token records", () => {
  const state = createCodexState("rollout-1");
  assert.equal(
    parseCodexLine(
      JSON.stringify({
        type: "event_msg",
        payload: {
          type: "thread_settings_applied",
          thread_settings: { model: "riverai/GLM-5.3", model_provider_id: "bifrost" },
        },
      }),
      state,
    ),
    null,
  );
  const event = parseCodexLine(
    JSON.stringify({
      timestamp: "2026-11-24T11:00:00.000Z",
      type: "token_usage_record",
      payload: {
        session_id: "codex-session",
        usage: {
          input_tokens: 1000,
          cached_input_tokens: 300,
          cache_write_input_tokens: 20,
          output_tokens: 40,
          reasoning_output_tokens: 5,
        },
      },
    }),
    state,
  );
  assert.deepEqual(event, {
    provider: "bifrost",
    model: "riverai/GLM-5.3",
    at: Date.parse("2026-11-24T11:00:00.000Z"),
    input: 680,
    cacheRead: 300,
    cacheWrite: 20,
    output: 45,
    sessionId: "codex-session",
  });
});
