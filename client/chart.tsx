import { Text, View } from "react-native";
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { point } from "../shared/contracts";
import { formatDay, formatTokens } from "./format";

type Point = { at: number; input: number; cacheRead: number; cacheWrite: number; output: number; total: number; cost: number };

export function UsageChart({ points, theme, compact }: { points: Point[]; theme: PluginScreenProps["theme"]; compact: boolean }) {
  const max = Math.max(1, ...points.map(p => p.total));
  const bars = points.length;
  const width = compact ? 4 : bars > 40 ? 5 : 9;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ height: 150, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
        {points.map(p => {
          const height = p.total > 0 ? Math.max(2, Math.round((p.total / max) * 146)) : 1;
          const cachedHeight = p.total > 0 ? Math.round((p.cacheRead / p.total) * height) : 0;
          const freshHeight = Math.max(0, height - cachedHeight);
          return (
            <View key={p.at} accessibilityLabel={`${formatDay(p.at)}: ${formatTokens(p.total)} processed`} style={{ flex: 1, maxWidth: width, height: 150, justifyContent: "flex-end", gap: 1 }}>
              {cachedHeight > 0 && <View style={{ height: cachedHeight, backgroundColor: theme.colors.accent, borderRadius: 1 }} />}
              {freshHeight > 0 && <View style={{ height: freshHeight, backgroundColor: theme.colors.foregroundMuted, borderRadius: 1, opacity: 0.55 }} />}
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{points[0] ? formatDay(points[0].at) : ""}</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>cached · uncached</Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{points[points.length - 1] ? formatDay(points[points.length - 1].at) : ""}</Text>
      </View>
    </View>
  );
}
