import type { PluginTheme } from "@getpaseo/plugin";

type Rgb = { r: number; g: number; b: number };

function parseColor(value: string): Rgb | null {
  const color = value.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .slice(0, 3)
        .split("")
        .map((digit) => `${digit}${digit}`)
        .join("");
    }
    if (digits.length < 6) return null;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color);
  if (!rgb) return null;
  return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
}

function luminance(value: string): number {
  const rgb = parseColor(value);
  if (!rgb) return 0;
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

export function isDarkTheme(theme: PluginTheme): boolean {
  return luminance(theme.colors.surface0) < 0.35;
}

/**
 * Harness identity colors are fixed, not derived from the accent. A neutral
 * theme would otherwise turn the first series gray, and sorting by usage would
 * swap the colors between ranges. These values keep the same harness readable
 * on light and dark surfaces and leave enough chroma for the stacked chart.
 */
const HARNESS_COLORS: Record<string, { light: string; dark: string }> = {
  opencode: { light: "#20744a", dark: "#6cb17b" },
  claude: { light: "#2e6ba8", dark: "#7fbadc" },
  codex: { light: "#6a4bb5", dark: "#9b7fdc" },
};

const FALLBACK_LIGHT = ["#b45309", "#0f766e", "#a21caf", "#4d7c0f", "#b91c1c"];
const FALLBACK_DARK = ["#d9a35f", "#67c7d8", "#d99ae8", "#a3c76a", "#e58b8b"];

function hash(value: string): number {
  let result = 2166136261;
  for (let index = 0; index < value.length; index++) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

export function harnessColor(theme: PluginTheme, id: string): string {
  const key = id.trim().toLowerCase();
  const known = HARNESS_COLORS[key];
  if (known) return isDarkTheme(theme) ? known.dark : known.light;
  const fallback = isDarkTheme(theme) ? FALLBACK_DARK : FALLBACK_LIGHT;
  return fallback[hash(key) % fallback.length];
}

/** Fixed sequence for any series list that is not harness-keyed. */
export function seriesColors(theme: PluginTheme): string[] {
  const dark = isDarkTheme(theme);
  const fallback = dark ? FALLBACK_DARK : FALLBACK_LIGHT;
  return [
    ...Object.values(HARNESS_COLORS).map((entry) => (dark ? entry.dark : entry.light)),
    ...fallback,
  ];
}

/** Append alpha to a hex or rgb() color; unknown formats fall back to the input. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, Math.max(0, alpha))})`;
}
