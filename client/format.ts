import type { Range } from "../shared/contracts";

export function formatTokens(n: number | null | undefined): string {
  const value = Math.max(0, n ?? 0);
  if (value >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return String(Math.round(value));
}

/** API-equivalent dollars: cents while actionable, compact once large. */
export function formatUsd(n: number | null | undefined): string {
  const value = Math.max(0, n ?? 0);
  if (value === 0) return "$0";
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value < 0.01) return "<$0.01";
  return `$${value.toFixed(2)}`;
}

export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

export function formatDay(at: number): string {
  return new Date(at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function formatBucket(at: number, range: Range): string {
  const date = new Date(at);
  if (range === "24h") {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  return formatDay(at);
}

export function formatRange(range: Range): string {
  if (range === "24h") return "last 24 hours";
  if (range === "7d") return "last 7 days";
  if (range === "30d") return "last 30 days";
  return "last 90 days";
}

export function formatAgo(at: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 20) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function share(part: number, whole: number): number {
  return whole > 0 ? (part / whole) * 100 : 0;
}
