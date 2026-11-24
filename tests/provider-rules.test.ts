import assert from "node:assert/strict";
import test from "node:test";
import { detectProvider } from "../client/provider-rules";

test("model vendors win over the gateway that served them", () => {
  assert.equal(
    detectProvider({
      harness: "OpenCode",
      provider: "bifrost",
      model: "claude-opus-5",
    }).id,
    "claude",
  );
  assert.equal(
    detectProvider({
      harness: "OpenCode",
      provider: "opencode-go",
      model: "deepseek-v4.1-flash",
    }).id,
    "deepseek",
  );
  assert.equal(
    detectProvider({
      harness: "OpenCode",
      provider: "bifrost",
      model: "gpt-6.1-sol",
    }).id,
    "openai",
  );
});

test("opaque lanes fall back to the gateway or harness", () => {
  assert.equal(detectProvider({ harness: "OpenCode", provider: "bifrost", model: "bifrost/code" }).id, "bifrost");
  assert.equal(detectProvider({ harness: "OpenCode", provider: "opencode-go", model: "space-bunny-free" }).id, "opencode");
  assert.equal(detectProvider({ harness: "Codex", model: "unknown" }).id, "codex");
});

test("vendor families, unknown providers, and label/icon pairs", () => {
  assert.equal(detectProvider({ model: "glm-5.3" }).id, "glm");
  assert.equal(detectProvider({ model: "kimi-k3.1-pro" }).id, "kimi");
  assert.equal(detectProvider({ model: "gemini-3-pro" }).id, "gemini");
  assert.equal(detectProvider({ model: "qwen3-coder" }).id, "qwen");
  assert.equal(detectProvider({ model: "mistral-large" }).id, "mistral");
  assert.equal(detectProvider({ model: "llama-4" }).id, "llama");
  assert.equal(detectProvider({ model: "who-knows" }).id, "unknown");
  const claude = detectProvider({ model: "claude-haiku-5-5" });
  assert.equal(claude.label, "Claude");
  assert.equal(claude.icon, "Sun");
});
