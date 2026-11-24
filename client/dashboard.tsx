import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { summary, type Range } from "../shared/contracts";
import { formatPct, formatTokens, formatUsd } from "./format";
import { UsageChart } from "./chart";
import { UsageCurve } from "./curve";

const RANGES: Array<{ id: Range; label: string }> = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
];

function Card({ label, value, hint, theme }: { label: string; value: string; hint: string; theme: PluginScreenProps["theme"] }) {
  return (
    <View style={{ flex: 1, minWidth: 130, padding: 14, borderWidth: 1, borderColor: theme.colors.foregroundMuted + "30", borderRadius: 8, gap: 4 }}>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, letterSpacing: 0.8 }}>{label}</Text>
      <Text style={{ color: theme.colors.foreground, fontSize: 21, fontWeight: "700" }}>{value}</Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>{hint}</Text>
    </View>
  );
}

export function Dashboard({ theme, layout }: PluginScreenProps) {
  const rpc = useRpc(summary);
  const [range, setRange] = useState<Range>("30d");
  const [chartMode, setChartMode] = useState<"curve" | "bars">("curve");
  const query = useQuery({
    queryKey: ["usage-ledger", range],
    queryFn: () => rpc({ range }),
    staleTime: 60_000,
    retry: 0,
    refetchOnWindowFocus: false,
  });
  const data = query.data;
  const total = data?.totals;
  const models = useMemo(() => data?.models.slice(0, 20) ?? [], [data]);
  const muted = { color: theme.colors.foregroundMuted, fontSize: 12 };
  const text = { color: theme.colors.foreground };
  const border = theme.colors.foregroundMuted + "30";
  const button = (label: string, value: string, action: () => void, primary = false, disabled = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={action} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, backgroundColor: primary ? theme.colors.accent : theme.colors.surface0, borderWidth: 1, borderColor: primary ? theme.colors.accent : border, opacity: disabled ? 0.45 : 1 }}>
      <Text style={{ color: primary ? theme.colors.accentForeground : theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>{value}</Text>
    </Pressable>
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.surface0 }} contentContainerStyle={{ padding: layout.compact ? 16 : 24, gap: 18 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <View style={{ gap: 4 }}>
          <Text style={{ ...text, fontSize: 26, fontWeight: "700" }}>Usage Ledger</Text>
          <Text style={muted}>Tokens, cache, and API-equivalent cost across every harness.</Text>
        </View>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          {RANGES.map(item => button(item.label, item.label, () => setRange(item.id), range === item.id, query.isFetching))}
          {button("Refresh", query.isFetching ? "Refreshing…" : "Refresh", () => query.refetch(), false, query.isFetching)}
        </View>
      </View>

      {query.error && <Text accessibilityRole="alert" style={{ ...text, color: "#ff8f8f" }}>{query.error instanceof Error ? query.error.message : String(query.error)}</Text>}
      {!data && query.isLoading && <Text style={muted}>Scanning OpenCode, Claude Code, Codex and Bifrost logs…</Text>}
      {data && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Card label="PROCESSED" value={formatTokens(total?.processed)} hint={`${total?.sessions ?? 0} sessions`} theme={theme} />
            <Card label="CACHED INPUT" value={formatTokens(total?.cacheRead)} hint={formatPct(data.totals.processed ? (data.totals.cacheRead / data.totals.processed) * 100 : 0)} theme={theme} />
            <Card label="UNCACHED INPUT" value={formatTokens(total?.input)} hint="fresh prompt tokens" theme={theme} />
            <Card label="OUTPUT" value={formatTokens(total?.output)} hint={`${formatTokens(total?.cacheWrite)} cache write`} theme={theme} />
            <Card label="CACHE SAVINGS" value={formatUsd(data.cacheSavingsUsd)} hint="vs full input rates" theme={theme} />
            <Card label="EST. COST" value={formatUsd(total?.cost)} hint={`${formatTokens(total?.unpricedTokens)} unpriced`} theme={theme} />
          </View>

          <View style={{ borderWidth: 1, borderColor: border, borderRadius: 8, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Text style={{ ...text, fontSize: 17, fontWeight: "600" }}>Processed tokens</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {button("Curve chart", "Curve", () => setChartMode("curve"), chartMode === "curve")}
                {button("Bar chart", "Bars", () => setChartMode("bars"), chartMode === "bars")}
              </View>
              <Text style={muted}>{query.isFetching ? "refreshing" : `updated ${new Date(data.generatedAt).toLocaleTimeString()}`}</Text>
            </View>
            {chartMode === "curve" ? <UsageCurve points={data.series} theme={theme} compact={layout.compact} /> : <UsageChart points={data.series} theme={theme} compact={layout.compact} />}
          </View>

          <View style={{ borderWidth: 1, borderColor: border, borderRadius: 8, overflow: "hidden" }}>
            <Text style={{ ...text, fontSize: 17, fontWeight: "600", padding: 16, borderBottomWidth: 1, borderColor: border }}>Harnesses</Text>
            {data.harnesses.map(h => (
              <View key={h.id} style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1, borderColor: border }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ ...text, fontWeight: "600" }}>{h.name}</Text>
                  <Text style={muted}>{h.sessions} sessions · {formatPct(h.cachePct)} cached</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 3 }}>
                  <Text style={text}>{formatTokens(h.processed)}</Text>
                  <Text style={muted}>{h.pricedTokens === h.processed ? formatUsd(h.cost) : `${formatUsd(h.cost)} + unpriced`}</Text>
                </View>
              </View>
            ))}
            {!data.harnesses.length && <Text style={{ ...muted, padding: 16 }}>No usage found in this range.</Text>}
          </View>

          <View style={{ borderWidth: 1, borderColor: border, borderRadius: 8, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 16, borderBottomWidth: 1, borderColor: border }}>
              <Text style={{ ...text, fontSize: 17, fontWeight: "600" }}>Models</Text>
              <Text style={muted}>{data.models.length} priced / unpriced</Text>
            </View>
            <View style={{ flexDirection: "row", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderColor: border }}>
              <Text style={{ ...muted, flex: 2 }}>Model</Text>
              <Text style={{ ...muted, flex: 1 }}>Harness</Text>
              <Text style={{ ...muted, flex: 1, textAlign: "right" }}>Tokens</Text>
              <Text style={{ ...muted, flex: 1, textAlign: "right" }}>Cost</Text>
            </View>
            {models.map(m => (
              <View key={`${m.harness}:${m.provider}:${m.model}`} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderColor: border }}>
                <View style={{ flex: 2, gap: 2 }}>
                  <Text numberOfLines={1} style={{ ...text, fontWeight: "600" }}>{m.model}</Text>
                  <Text style={muted}>{m.provider} · {formatPct(m.cachePct)} cache{!m.priced ? " · Unpriced" : ""}</Text>
                </View>
                <Text numberOfLines={1} style={{ ...muted, flex: 1 }}>{m.harness}</Text>
                <Text style={{ ...text, flex: 1, textAlign: "right" }}>{formatTokens(m.processed)}</Text>
                <Text style={{ ...text, flex: 1, textAlign: "right" }}>{m.priced ? formatUsd(m.cost) : "Unpriced"}</Text>
              </View>
            ))}
            {!models.length && <Text style={{ ...muted, padding: 16 }}>No model usage in this range.</Text>}
          </View>

          <View style={{ gap: 4 }}>
            {data.notes.map(note => <Text key={note} style={muted}>· {note}</Text>)}
          </View>
        </>
      )}
    </ScrollView>
  );
}
