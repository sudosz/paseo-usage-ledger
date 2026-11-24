export function formatTokens(n: number | null | undefined): string {
  const v = Math.max(0, n ?? 0);
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}

export function formatUsd(n: number | null | undefined): string {
  const v = Math.max(0, n ?? 0);
  if (v >= 1000) return `$${(v / 1000).toFixed(2)}K`;
  return `$${v.toFixed(v > 0 && v < 0.01 ? 4 : 2)}`;
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function formatDay(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
