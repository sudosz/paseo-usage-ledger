import { Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import { formatDay, formatTokens } from "./format";

type Point = { at: number; input: number; cacheRead: number; cacheWrite: number; output: number; total: number; cost: number };

const SAMPLES = 96;

function interpolate(points: Point[], index: number, key: "total" | "cacheRead"): number {
  if (!points.length) return 0;
  if (points.length === 1) return points[0][key];
  const position = (index / (SAMPLES - 1)) * (points.length - 1);
  const left = Math.floor(position);
  const right = Math.min(points.length - 1, left + 1);
  const fraction = position - left;
  return points[left][key] * (1 - fraction) + points[right][key] * fraction;
}

/** Filled-line chart drawn from sliver Views; Paseo plugins cannot use SVG. */
export function UsageCurve({ points, theme, compact }: { points: Point[]; theme: PluginScreenProps["theme"]; compact: boolean }) {
  const max = Math.max(1, ...points.map(p => p.total));
  const height = compact ? 120 : 156;
  const samples = Array.from({ length: SAMPLES }, (_, index) => ({
    total: interpolate(points, index, "total"),
    cached: interpolate(points, index, "cacheRead"),
  }));
  const grid = [0, 1, 2, 3, 4];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height: height + 8, position: "relative" }}>
        {grid.map(tick => (
          <View key={tick} style={{ position: "absolute", left: 0, right: 0, top: 8 + (height * tick) / 4, borderTopWidth: 1, borderColor: theme.colors.foregroundMuted + "22" }} />
        ))}
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height, flexDirection: "row", alignItems: "flex-end" }}>
          {samples.map((sample, index) => (
            <View key={index} style={{ flex: 1, height, justifyContent: "flex-end" }}>
              <View style={{ height: `${Math.min(100, (sample.cached / max) * 100)}%`, backgroundColor: theme.colors.foregroundMuted, opacity: 0.18 }} />
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${Math.min(100, (sample.total / max) * 100)}%`, borderTopWidth: 2, borderColor: theme.colors.accent }} />
            </View>
          ))}
        </View>
        <Text style={{ position: "absolute", right: 0, top: 0, color: theme.colors.foregroundMuted, fontSize: 10 }}>{formatTokens(max)}</Text>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{points[0] ? formatDay(points[0].at) : ""}</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>processed · cached</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{points[points.length - 1] ? formatDay(points[points.length - 1].at) : ""}</Text>
      </View>
    </View>
  );
}
