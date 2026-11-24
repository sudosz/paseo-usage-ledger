import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRpc, type PluginScreenProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { summary, type Range } from "../shared/contracts";
import { formatAgo, formatBucket, formatPct, formatRange, formatTokens, formatUsd, share } from "./format";
import { FlowChart, type ChartMetric, type ChartView } from "./flow-chart";
import { harnessColor, withAlpha } from "./palette";
import { Chip, EmptyState, MetricCard, Meter, SectionHeader, Segmented, cardStyle, type HoverState } from "./ui";

const RANGES: Array<{ value: Range; label: string }> = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

const METRICS: Array<{ value: ChartMetric; label: string }> = [
  { value: "tokens", label: "Tokens" },
  { value: "cached", label: "Cached" },
  { value: "cost", label: "Cost" },
];

const VIEWS: Array<{ value: ChartView; label: string; icon: string }> = [
  { value: "curve", label: "Curve", icon: "Spline" },
  { value: "bars", label: "Bars", icon: "ChartNoAxesColumn" },
];

const MODEL_PREVIEW = 8;

const RANGE_DAYS: Record<Range, number> = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 };

function modelKey(model: { harness: string; provider: string; model: string }): string {
  return `${model.harness}:${model.provider}:${model.model}`;
}

function DetailStat({
  theme,
  label,
  value,
}: {
  theme: PluginScreenProps["theme"];
  label: string;
  value: string;
}) {
  return (
    <View style={{ minWidth: 92, gap: 2 }}>
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 10.5,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: theme.colors.foreground,
          fontSize: 12,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function HeroStat({
  theme,
  label,
  value,
  detail,
  tone,
}: {
  theme: PluginScreenProps["theme"];
  label: string;
  value: string;
  detail: string;
  tone?: "warning";
}) {
  return (
    <View style={{ minWidth: 100, gap: 3 }}>
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 11,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: theme.colors.foreground,
          fontSize: 18,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          color: tone === "warning" ? theme.colors.statusWarning : theme.colors.foregroundMuted,
          fontSize: 10.5,
        }}
      >
        {detail}
      </Text>
    </View>
  );
}

function RefreshButton({
  theme,
  compact,
  busy,
  onPress,
}: {
  theme: PluginScreenProps["theme"];
  compact: boolean;
  busy: boolean;
  onPress(): void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={busy ? "Refreshing usage" : "Refresh usage"}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={({ hovered }: HoverState) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        height: 34,
        paddingHorizontal: compact ? 9 : 11,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: hovered ? theme.colors.surface2 : theme.colors.surface0,
        opacity: busy ? 0.55 : 1,
      })}
    >
      <Icon
        name={busy ? "LoaderCircle" : "RefreshCw"}
        size={14}
        color={theme.colors.foregroundMuted}
      />
      {compact ? null : (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, fontWeight: "600" }}>
          {busy ? "Scanning" : "Refresh"}
        </Text>
      )}
    </Pressable>
  );
}

export function Dashboard({ theme, layout }: PluginScreenProps) {
  const rpc = useRpc(summary);
  const [range, setRange] = useState<Range>("30d");
  const [metric, setMetric] = useState<ChartMetric>("tokens");
  const [view, setView] = useState<ChartView>("curve");
  const [showAllModels, setShowAllModels] = useState(false);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const query = useQuery({
    queryKey: ["usage-ledger", range],
    queryFn: () => rpc({ range }),
    staleTime: 60_000,
    retry: 0,
    refetchOnWindowFocus: true,
  });
  const data = query.data;
  const compact = layout.compact;
  const models = data?.models ?? [];
  const visibleModels = showAllModels ? models : models.slice(0, MODEL_PREVIEW);
  const unpricedModels = models.filter((model) => !model.priced);
  const harnessColorByName = useMemo(
    () =>
      new Map(
        (data?.harnesses ?? []).map((harness) => [
          harness.name,
          harnessColor(theme, harness.id),
        ]),
      ),
    [data?.harnesses, theme],
  );
  const total = data?.totals;
  const prompt = (total?.input ?? 0) + (total?.cacheRead ?? 0) + (total?.cacheWrite ?? 0);
  const cacheRate = prompt > 0 ? share(total?.cacheRead ?? 0, prompt) : 0;
  const peak = useMemo(() => {
    const valueOf = (point: { total: number; cost: number; cacheRead: number }) =>
      metric === "cost" ? point.cost : metric === "cached" ? point.cacheRead : point.total;
    let best = data?.series[0];
    for (const point of data?.series ?? []) {
      if (!best || valueOf(point) > valueOf(best)) best = point;
    }
    return best;
  }, [data?.series, metric]);
  const peakValue =
    peak === undefined
      ? null
      : metric === "cost"
        ? formatUsd(peak.cost)
        : metric === "cached"
          ? formatTokens(peak.cacheRead)
          : formatTokens(peak.total);
  const firstActiveIndex = data?.series.findIndex((point) => point.total > 0) ?? -1;
  const firstActive =
    firstActiveIndex > 1 && data
      ? formatBucket(data.series[firstActiveIndex].at, range)
      : null;

  const rangeControl = (
    <Segmented<Range>
      theme={theme}
      value={range}
      onChange={setRange}
      options={RANGES}
      label="Time range"
      compact={compact}
    />
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{
        width: "100%",
        maxWidth: 1120,
        alignSelf: "center",
        padding: compact ? 14 : 24,
        paddingBottom: 40,
        gap: 18,
      }}
    >
      <View
        style={{
          ...cardStyle(theme, 14),
          padding: compact ? 16 : 22,
          gap: 16,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <Text
            style={{
              color: theme.colors.foregroundMuted,
              fontSize: 12,
              fontWeight: "500",
            }}
          >
            Processed tokens · {formatRange(range)}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {rangeControl}
            <RefreshButton
              theme={theme}
              compact={compact}
              busy={query.isFetching}
              onPress={() => query.refetch()}
            />
          </View>
        </View>

        {data && total ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
              <Text
                accessibilityLabel={`${formatTokens(total.processed)} processed tokens in the ${formatRange(range)}`}
                style={{
                  color: theme.colors.foreground,
                  fontSize: compact ? 38 : 46,
                  lineHeight: compact ? 42 : 50,
                  fontWeight: "700",
                  letterSpacing: -1.2,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {formatTokens(total.processed)}
              </Text>
              <View style={{ flexDirection: "row", gap: 6, paddingBottom: 7, flexWrap: "wrap" }}>
                <Chip theme={theme} label={`${formatPct(cacheRate)} cached`} tone="success" />
                {data.unpricedTokens > 0 ? (
                  <Chip
                    theme={theme}
                    label={`${formatTokens(data.unpricedTokens)} unpriced`}
                    tone="warning"
                  />
                ) : null}
              </View>
            </View>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12.5 }}>
              {total.sessions} sessions · {formatTokens(total.cacheRead)} re-read from cache ·{" "}
              {formatUsd(total.cost)} API-equivalent · updated {formatAgo(data.generatedAt)}
            </Text>

            <View style={{ gap: 7 }}>
              <Meter
                theme={theme}
                height={7}
                segments={[
                  { key: "cached", value: total.cacheRead, color: theme.colors.accent },
                  {
                    key: "uncached",
                    value: total.input,
                    color: theme.colors.foregroundMuted,
                  },
                  {
                    key: "write",
                    value: total.cacheWrite,
                    color: theme.colors.statusWarning,
                  },
                  { key: "output", value: total.output, color: theme.colors.statusSuccess },
                ]}
              />
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  columnGap: 14,
                  rowGap: 4,
                }}
              >
                {[
                  {
                    key: "cached",
                    label: "Cached",
                    value: total.cacheRead,
                    color: theme.colors.accent,
                  },
                  {
                    key: "uncached",
                    label: "Uncached",
                    value: total.input,
                    color: theme.colors.foregroundMuted,
                  },
                  {
                    key: "write",
                    label: "Cache write",
                    value: total.cacheWrite,
                    color: theme.colors.statusWarning,
                  },
                  {
                    key: "output",
                    label: "Output",
                    value: total.output,
                    color: theme.colors.statusSuccess,
                  },
                ].map((item) => (
                  <View
                    key={item.key}
                    style={{ flexDirection: "row", alignItems: "center", gap: 5 }}
                  >
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 2,
                        backgroundColor: item.color,
                      }}
                    />
                    <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
                      {item.label}
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.foreground,
                        fontSize: 10.5,
                        fontWeight: "600",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {formatTokens(item.value)}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                columnGap: 18,
                rowGap: 12,
                paddingTop: 14,
                borderTopWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <HeroStat
                theme={theme}
                label="API-equivalent cost"
                value={formatUsd(total.cost)}
                detail={
                  unpricedModels.length
                    ? `${unpricedModels.length} model${unpricedModels.length === 1 ? "" : "s"} unpriced`
                    : "all usage priced"
                }
                tone={unpricedModels.length ? "warning" : undefined}
              />
              <HeroStat
                theme={theme}
                label="Cache savings"
                value={formatUsd(data.cacheSavingsUsd)}
                detail="vs full input rates"
              />
              <HeroStat
                theme={theme}
                label="Avg / day"
                value={formatUsd((total.cost ?? 0) / RANGE_DAYS[range])}
                detail={`${formatTokens(prompt)} prompt tokens`}
              />
              <HeroStat
                theme={theme}
                label="Cost / session"
                value={formatUsd(total.sessions > 0 ? total.cost / total.sessions : 0)}
                detail={`${total.sessions} sessions`}
              />
            </View>
          </>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.colors.foreground, fontSize: 24, fontWeight: "700" }}>
              Reading usage…
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12.5 }}>
              OpenCode sessions, Claude Code history, Codex rollouts and the Bifrost snapshot.
            </Text>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              {["OpenCode DB", "Claude JSONL", "Codex sessions", "Bifrost lanes"].map((label) => (
                <View
                  key={label}
                  style={{
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                    borderRadius: 7,
                    backgroundColor: theme.colors.surface0,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                  }}
                >
                  <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
                    {label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>

      {query.error ? (
        <View
          accessibilityRole="alert"
          style={{
            ...cardStyle(theme, 10),
            padding: 12,
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 8,
            borderColor: withAlpha(theme.colors.statusDanger, 0.4),
            backgroundColor: withAlpha(theme.colors.statusDanger, 0.08),
          }}
        >
          <Icon name="TriangleAlert" size={15} color={theme.colors.statusDanger} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: theme.colors.statusDanger, fontSize: 12, fontWeight: "600" }}>
              {data ? "Showing the last completed scan" : "Usage scan failed"}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
              {query.error instanceof Error ? query.error.message : String(query.error)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry usage scan"
            onPress={() => query.refetch()}
            style={({ hovered }: HoverState) => ({
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 6,
              backgroundColor: hovered ? theme.colors.surface2 : "transparent",
            })}
          >
            <Text style={{ color: theme.colors.foreground, fontSize: 11, fontWeight: "600" }}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : null}

      {data && total ? (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            <MetricCard
              theme={theme}
              compact={compact}
              label="Cached input"
              value={formatTokens(total.cacheRead)}
              hint={`${formatPct(cacheRate)} of prompt`}
              bar={{ value: share(total.cacheRead, total.processed), color: theme.colors.accent }}
            />
            <MetricCard
              theme={theme}
              compact={compact}
              label="Uncached input"
              value={formatTokens(total.input)}
              hint="fresh prompt tokens"
              bar={{
                value: share(total.input, total.processed),
                color: theme.colors.foregroundMuted,
              }}
            />
            <MetricCard
              theme={theme}
              compact={compact}
              label="Cache write"
              value={formatTokens(total.cacheWrite)}
              hint="written to cache"
              bar={{
                value: share(total.cacheWrite, total.processed),
                color: theme.colors.statusWarning,
              }}
            />
            <MetricCard
              theme={theme}
              compact={compact}
              label="Output"
              value={formatTokens(total.output)}
              hint="generated output"
              bar={{
                value: share(total.output, total.processed),
                color: theme.colors.statusSuccess,
              }}
            />
          </View>

          <View style={{ ...cardStyle(theme), padding: compact ? 14 : 18, gap: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-end",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 10,
              }}
            >
              <View style={{ gap: 2 }}>
                <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>
                  Token flow
                </Text>
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11.5 }}>
                  {peak && peakValue
                    ? `Peak ${formatBucket(peak.at, range)} · ${peakValue}${
                        metric === "tokens" ? " tokens" : metric === "cached" ? " cached" : ""
                      }`
                    : "Daily buckets, split by harness"}
                </Text>
              </View>
              <View
                style={{
                  flexDirection: compact ? "column" : "row",
                  alignItems: "flex-start",
                  gap: 7,
                }}
              >
                <Segmented<ChartMetric>
                  theme={theme}
                  value={metric}
                  onChange={setMetric}
                  options={METRICS}
                  label="Chart metric"
                  compact
                />
                <Segmented<ChartView>
                  theme={theme}
                  value={view}
                  onChange={setView}
                  options={VIEWS}
                  label="Chart type"
                  compact
                />
              </View>
            </View>
            <FlowChart
              series={data.harnessSeries}
              range={range}
              metric={metric}
              view={view}
              theme={theme}
              compact={compact}
            />
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 6,
                paddingTop: 10,
                borderTopWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
                {formatBucket(data.since, range)} — {formatBucket(data.until, range)}
                {firstActive ? ` · first usage ${firstActive}` : ""}
              </Text>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
                {data.series.length} buckets · {formatRange(range)}
              </Text>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <SectionHeader
              theme={theme}
              title="Harness mix"
              subtitle="Where the tokens came from"
              trailing={
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
                  {data.harnesses.length} source{data.harnesses.length === 1 ? "" : "s"}
                </Text>
              }
            />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {data.harnesses.map((harness) => {
                const color = harnessColor(theme, harness.id);
                const partiallyUnpriced = harness.unpricedTokens > 0;
                const fullyUnpriced = harness.pricedTokens === 0;
                return (
                  <View
                    key={harness.id}
                    style={{
                      ...cardStyle(theme, 10),
                      flexGrow: 1,
                      flexBasis: compact ? 220 : 250,
                      padding: 14,
                      gap: 9,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <View
                        style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color }}
                      />
                      <Text
                        style={{
                          flex: 1,
                          color: theme.colors.foreground,
                          fontSize: 13,
                          fontWeight: "600",
                        }}
                      >
                        {harness.name}
                      </Text>
                      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
                        {formatPct(share(harness.processed, total.processed))}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: theme.colors.foreground,
                        fontSize: 21,
                        fontWeight: "700",
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {formatTokens(harness.processed)}
                    </Text>
                    <Meter
                      theme={theme}
                      height={4}
                      segments={[
                        {
                          key: "share",
                          value: share(harness.processed, total.processed),
                          color: withAlpha(color, 0.85),
                        },
                      ]}
                    />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text
                        numberOfLines={1}
                        style={{ flex: 1, color: theme.colors.foregroundMuted, fontSize: 10.5 }}
                      >
                        {harness.sessions} sessions · {formatPct(harness.cachePct)} cached
                      </Text>
                      <Text
                        style={{
                          color: fullyUnpriced
                            ? theme.colors.statusWarning
                            : theme.colors.foreground,
                          fontSize: 11.5,
                          fontWeight: "600",
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {fullyUnpriced ? "Unpriced" : formatUsd(harness.cost)}
                      </Text>
                    </View>
                    {partiallyUnpriced ? (
                      <Text
                        numberOfLines={1}
                        style={{ color: theme.colors.statusWarning, fontSize: 9.5 }}
                      >
                        includes {formatTokens(harness.unpricedTokens)} tokens without a rate
                      </Text>
                    ) : null}
                  </View>
                );
              })}
              {data.harnesses.length === 0 ? (
                <View style={{ ...cardStyle(theme, 10), flex: 1 }}>
                  <EmptyState theme={theme} message="No harness activity in this window." />
                </View>
              ) : null}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <SectionHeader
              theme={theme}
              title="Models"
              subtitle="Token volume, cache efficiency and API-equivalent cost"
              trailing={
                unpricedModels.length ? (
                  <Chip
                    theme={theme}
                    label={`${unpricedModels.length} unpriced`}
                    tone="warning"
                  />
                ) : (
                  <Chip theme={theme} label="All priced" tone="success" />
                )
              }
            />
            <View style={{ ...cardStyle(theme), overflow: "hidden" }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderBottomWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface0,
                }}
              >
                <Text style={{ flex: 2.4, color: theme.colors.foregroundMuted, fontSize: 11 }}>
                  Model
                </Text>
                {compact ? null : (
                  <Text style={{ width: 86, color: theme.colors.foregroundMuted, fontSize: 11 }}>
                    Cache
                  </Text>
                )}
                <Text
                  style={{
                    width: 82,
                    textAlign: "right",
                    color: theme.colors.foregroundMuted,
                    fontSize: 11,
                  }}
                >
                  Tokens
                </Text>
                <Text
                  style={{
                    width: 88,
                    textAlign: "right",
                    color: theme.colors.foregroundMuted,
                    fontSize: 11,
                  }}
                >
                  Cost
                </Text>
              </View>
              {visibleModels.map((model, index) => {
                const key = modelKey(model);
                const expanded = expandedModel === key;
                const modelColor = harnessColorByName.get(model.harness) ?? theme.colors.accent;
                return (
                  <View
                    key={key}
                    style={{
                      borderBottomWidth: index === visibleModels.length - 1 ? 0 : 1,
                      borderColor: theme.colors.border,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${model.model}: ${formatTokens(model.processed)} tokens, ${model.priced ? formatUsd(model.cost) : "unpriced"}, ${formatPct(model.share)} share. ${expanded ? "Collapse" : "Expand"} details.`}
                      accessibilityState={{ expanded }}
                      onPress={() => setExpandedModel(expanded ? null : key)}
                      style={({ hovered }: HoverState) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                        backgroundColor: hovered || expanded ? theme.colors.surface0 : undefined,
                      })}
                    >
                      <View style={{ flex: 2.4, gap: 3, paddingRight: 10 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Text
                            numberOfLines={1}
                            style={{
                              color: theme.colors.foreground,
                              fontSize: 12.5,
                              fontWeight: "600",
                              flexShrink: 1,
                            }}
                          >
                            {model.model}
                          </Text>
                          {model.priced ? null : (
                            <Chip theme={theme} label="Unpriced" tone="warning" />
                          )}
                          <Icon
                            name={expanded ? "ChevronDown" : "ChevronRight"}
                            size={11}
                            color={theme.colors.foregroundMuted}
                          />
                        </View>
                        <Text
                          numberOfLines={1}
                          style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}
                        >
                          {model.provider} · {model.harness} · {model.sessions} sessions ·{" "}
                          {formatPct(model.share)} of tokens
                        </Text>
                        <Meter
                          theme={theme}
                          height={3}
                          segments={[
                            {
                              key: "share",
                              value: Math.max(0.5, model.share),
                              color: withAlpha(modelColor, 0.7),
                            },
                          ]}
                        />
                      </View>
                      {compact ? null : (
                        <View style={{ width: 86, gap: 3, paddingRight: 8 }}>
                          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
                            {formatPct(model.cachePct)}
                          </Text>
                          <Meter
                            theme={theme}
                            height={3}
                            segments={[
                              {
                                key: "cache",
                                value: Math.max(0.5, model.cachePct),
                                color: modelColor,
                              },
                            ]}
                          />
                        </View>
                      )}
                      <Text
                        style={{
                          width: 82,
                          textAlign: "right",
                          color: theme.colors.foreground,
                          fontSize: 11.5,
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {formatTokens(model.processed)}
                      </Text>
                      <Text
                        style={{
                          width: 88,
                          textAlign: "right",
                          color: model.priced
                            ? theme.colors.foreground
                            : theme.colors.statusWarning,
                          fontSize: 11.5,
                          fontWeight: "600",
                          fontVariant: ["tabular-nums"],
                        }}
                      >
                        {model.priced ? formatUsd(model.cost) : "Unpriced"}
                      </Text>
                    </Pressable>
                    {expanded ? (
                      <View
                        style={{
                          paddingHorizontal: 14,
                          paddingTop: 2,
                          paddingBottom: 12,
                          gap: 8,
                          backgroundColor: theme.colors.surface0,
                        }}
                      >
                        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 8 }}>
                          <DetailStat
                            theme={theme}
                            label="BLENDED / 1M"
                            value={
                              model.pricedTokens > 0
                                ? formatUsd(model.cost / (model.pricedTokens / 1_000_000))
                                : "—"
                            }
                          />
                          <DetailStat
                            theme={theme}
                            label="Cached"
                            value={formatTokens(model.cacheRead)}
                          />
                          <DetailStat
                            theme={theme}
                            label="Uncached"
                            value={formatTokens(model.input)}
                          />
                          <DetailStat
                            theme={theme}
                            label="Cache write"
                            value={formatTokens(model.cacheWrite)}
                          />
                          <DetailStat
                            theme={theme}
                            label="Output"
                            value={formatTokens(model.output)}
                          />
                          <DetailStat
                            theme={theme}
                            label="Est. cost"
                            value={model.priced ? formatUsd(model.cost) : "—"}
                          />
                        </View>
                        {model.unpricedTokens > 0 ? (
                          <Text style={{ color: theme.colors.statusWarning, fontSize: 10.5 }}>
                            {formatTokens(model.unpricedTokens)} tokens have no published rate and
                            are excluded from cost.
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {models.length === 0 ? (
                <EmptyState theme={theme} message="No model usage in this window." />
              ) : null}
              {models.length > MODEL_PREVIEW ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showAllModels }}
                  onPress={() => setShowAllModels((value) => !value)}
                  style={({ hovered }: HoverState) => ({
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 10,
                    backgroundColor: hovered ? theme.colors.surface2 : theme.colors.surface0,
                    borderTopWidth: 1,
                    borderColor: theme.colors.border,
                  })}
                >
                  <Text style={{ color: theme.colors.foreground, fontSize: 11.5, fontWeight: "600" }}>
                    {showAllModels ? "Show fewer" : `Show all ${models.length} models`}
                  </Text>
                  <Icon
                    name={showAllModels ? "ChevronUp" : "ChevronDown"}
                    size={13}
                    color={theme.colors.foregroundMuted}
                  />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={{ ...cardStyle(theme, 10), overflow: "hidden" }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: notesOpen }}
              onPress={() => setNotesOpen((value) => !value)}
              style={({ hovered }: HoverState) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                padding: 13,
                backgroundColor: hovered ? theme.colors.surface2 : "transparent",
              })}
            >
              <Icon name="Info" size={14} color={theme.colors.foregroundMuted} />
              <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: 12, fontWeight: "600" }}>
                About these numbers
              </Text>
              <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
                API-equivalent estimates
              </Text>
              <Icon
                name={notesOpen ? "ChevronUp" : "ChevronDown"}
                size={13}
                color={theme.colors.foregroundMuted}
              />
            </Pressable>
            {notesOpen ? (
              <View
                style={{
                  paddingHorizontal: 14,
                  paddingBottom: 14,
                  gap: 5,
                  borderTopWidth: 1,
                  borderColor: theme.colors.border,
                  paddingTop: 10,
                }}
              >
                {data.notes.map((note) => (
                  <Text
                    key={note}
                    style={{ color: theme.colors.foregroundMuted, fontSize: 10.5, lineHeight: 16 }}
                  >
                    · {note}
                  </Text>
                ))}
                <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5, lineHeight: 16 }}>
                  · Sources: OpenCode session table, Claude Code JSONL, Codex rollouts, optional
                  Bifrost lane snapshot.
                </Text>
              </View>
            ) : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
