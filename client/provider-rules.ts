export type ProviderMark = {
  id: string;
  label: string;
  icon: string;
  color: string;
};

type ProviderInput = {
  harness?: string;
  provider?: string;
  model?: string;
};

type Rule = ProviderMark & { test: RegExp };

/**
 * Vendor rules run before harness rules so a Claude model served through
 * Bifrost keeps the Claude mark, while an opaque lane such as `bifrost/code`
 * falls back to the gateway or harness mark. Detection is substring-based on
 * the strings the logs already contain; no provider API or icon download.
 */
const RULES: Rule[] = [
  {
    id: "claude",
    label: "Claude",
    icon: "Sun",
    color: "#d97757", // taste-skill-ignore: Claude brand mark, not a page accent
    test: /claude|anthropic|sonnet|opus|haiku/i,
  },
  {
    id: "codex",
    label: "Codex",
    icon: "Asterisk",
    color: "#10a37f",
    test: /\bcodex\b/i,
  },
  {
    id: "openai",
    label: "OpenAI",
    icon: "Asterisk",
    color: "#10a37f",
    test: /openai|\bgpt-|\bo[134]\b/i,
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    icon: "Waves",
    color: "#4d6bfe",
    test: /deepseek/i,
  },
  {
    id: "gemini",
    label: "Gemini",
    icon: "Gem",
    color: "#4285f4",
    test: /gemini|google/i,
  },
  {
    id: "grok",
    label: "Grok",
    icon: "X",
    color: "#8b8b93",
    test: /grok|\bxai\b/i,
  },
  {
    id: "glm",
    label: "GLM",
    icon: "Sparkles",
    color: "#3b82f6",
    test: /\bglm\b|zhipu/i,
  },
  {
    id: "kimi",
    label: "Kimi",
    icon: "Moon",
    color: "#8b5cf6", // taste-skill-ignore: Kimi brand mark
    test: /kimi|moonshot/i,
  },
  {
    id: "qwen",
    label: "Qwen",
    icon: "Cloud",
    color: "#615ced",
    test: /qwen|alibaba|tongyi/i,
  },
  {
    id: "cursor",
    label: "Cursor",
    icon: "MousePointer2",
    color: "#8b8b93",
    test: /\bcursor\b/i,
  },
  {
    id: "copilot",
    label: "Copilot",
    icon: "Github",
    color: "#8b8b93",
    test: /copilot/i,
  },
  {
    id: "mistral",
    label: "Mistral",
    icon: "Wind",
    color: "#f97316",
    test: /mistral|mixtral/i,
  },
  {
    id: "llama",
    label: "Llama",
    icon: "Rabbit",
    color: "#0866ff",
    test: /llama|meta-llama/i,
  },
  {
    id: "antigravity",
    label: "Antigravity",
    icon: "Triangle",
    color: "#8b5cf6", // taste-skill-ignore: Antigravity brand mark
    test: /antigravity/i,
  },
  {
    id: "opencode",
    label: "OpenCode",
    icon: "SquareTerminal",
    color: "#2f9e63",
    test: /opencode/i,
  },
  {
    id: "bifrost",
    label: "Bifrost",
    icon: "Rainbow",
    color: "#d99a3d",
    test: /bifrost/i,
  },
  {
    id: "ollama",
    label: "Ollama",
    icon: "Box",
    color: "#a3a3a3",
    test: /ollama/i,
  },
];

const UNKNOWN: ProviderMark = {
  id: "unknown",
  label: "Provider",
  icon: "Cpu",
  color: "#8b8b93",
};

export function detectProvider(input: ProviderInput): ProviderMark {
  // Model first: the vendor is the most recognizable mark when a gateway
  // fronts several providers. Then the provider, then the harness.
  const model = input.model ?? "";
  for (const rule of RULES) {
    if (model && rule.test.test(model)) return rule;
  }
  const provider = input.provider ?? "";
  for (const rule of RULES) {
    if (provider && rule.test.test(provider)) return rule;
  }
  const harness = input.harness ?? "";
  for (const rule of RULES) {
    if (harness && rule.test.test(harness)) return rule;
  }
  return UNKNOWN;
}
