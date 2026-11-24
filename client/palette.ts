import type { PluginTheme } from "@getpaseo/plugin";

type Rgb = { r: number; g: number; b: number };
type Hsl = { h: number; s: number; l: number };

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

function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const l = (max + min) / 2;
  if (delta === 0) return { h: 0, s: 0, l };
  const s = delta / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === red) h = ((green - blue) / delta) % 6;
  else if (max === green) h = (blue - red) / delta + 2;
  else h = (red - green) / delta + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToHex({ h, s, l }: Hsl): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const sector = Math.floor(h / 60) % 6;
  const [r, g, b] =
    sector === 0
      ? [c, x, 0]
      : sector === 1
        ? [x, c, 0]
        : sector === 2
          ? [0, c, x]
          : sector === 3
            ? [0, x, c]
            : sector === 4
              ? [x, 0, c]
              : [c, 0, x];
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, (value + m) * 255)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
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

const paletteCache = new Map<string, string[]>();

/**
 * Categorical colors derived from the theme accent. Hue rotation keeps the
 * accent first and gives each harness a stable, distinguishable identity
 * without shipping a palette the theme cannot contrast against.
 */
export function seriesColors(theme: PluginTheme): string[] {
  const key = `${theme.colors.surface0}|${theme.colors.accent}`;
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const accent = parseColor(theme.colors.accent);
  const dark = isDarkTheme(theme);
  const base = accent ? rgbToHsl(accent) : { h: 212, s: 0.7, l: 0.6 };
  const lightness = dark ? 0.68 : 0.42;
  const saturation = Math.max(0.5, Math.min(0.78, base.s || 0.64));
  const colors = [
    theme.colors.accent,
    ...[52, 108, 164, 220, 276, 328].map((offset) =>
      hslToHex({ h: (base.h + offset) % 360, s: saturation, l: lightness }),
    ),
  ];
  paletteCache.set(key, colors);
  return colors;
}

/** Append alpha to a hex or rgb() color; unknown formats fall back to the input. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, Math.max(0, alpha))})`;
}
