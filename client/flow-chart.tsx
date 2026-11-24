import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  PanResponder,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type ViewProps,
} from "react-native";
import type { Range } from "../shared/contracts";
import { formatBucket, formatTokens, formatUsd } from "./format";
import { niceScale, sampleCurve } from "./chart-scale";
import { seriesColors, withAlpha } from "./palette";

export type ChartMetric = "tokens" | "cached" | "cost";
export type ChartView = "curve" | "bars";

type Point = { at: number; total: number; cacheRead: number; cost: number };
type Series = { id: string; name: string; points: Point[] };

function valueOf(point: Point | undefined, metric: ChartMetric): number {
  if (!point) return 0;
  if (metric === "cached") return point.cacheRead;
  if (metric === "cost") return point.cost;
  return point.total;
}

function formatMetric(value: number, metric: ChartMetric): string {
  return metric === "cost" ? formatUsd(value) : formatTokens(value);
}

function seriesTotal(series: Series, metric: ChartMetric): number {
  let total = 0;
  for (const point of series.points) total += valueOf(point, metric);
  return total;
}

type ViewPointerEvent = Parameters<NonNullable<ViewProps["onPointerMove"]>>[0];

function percentage(value: number, max: number): `${number}%` {
  return `${Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100))}%`;
}

/**
 * Stacked area or bars, drawn with plain Views. Paseo plugins cannot use SVG,
 * so each sample is a sliver whose height is its share of the plot; the stroke
 * is the sliver's top border. Series stack from the same baseline, which keeps
 * harness attribution readable without a drawing library.
 */
export function FlowChart({
  series,
  range,
  metric,
  view,
  theme,
  compact,
}: {
  series: Series[];
  range: Range;
  metric: ChartMetric;
  view: ChartView;
  theme: PluginTheme;
  compact: boolean;
}) {
  const colors = useMemo(() => seriesColors(theme), [theme]);
  const plotHeight = compact ? 148 : 188;
  const samples = compact ? 72 : 108;
  const bucketCount = series[0]?.points.length ?? 0;
  const plot = useMemo(() => {
    const maxValue = Math.max(
      1,
      ...Array.from({ length: bucketCount }, (_, index) =>
        series.reduce((sum, entry) => sum + valueOf(entry.points[index], metric), 0),
      ),
    );
    const scale = niceScale(maxValue, compact ? 3 : 4);
    const curves = series.map((entry) =>
      sampleCurve(
        entry.points.map((point) => valueOf(point, metric)),
        samples,
      ),
    );
    return { scale, curves };
  }, [series, bucketCount, metric, compact, samples]);

  const [plotWidth, setPlotWidth] = useState(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const selectAt = useCallback(
    (locationX: number) => {
      if (plotWidth <= 0 || bucketCount === 0) return;
      const fraction = Math.min(1, Math.max(0, locationX / plotWidth));
      setHoverIndex(Math.min(bucketCount - 1, Math.round(fraction * (bucketCount - 1))));
    },
    [bucketCount, plotWidth],
  );
  const trackHover = useCallback(
    (event: ViewPointerEvent) => {
      const native = event.nativeEvent as unknown as { locationX?: number; offsetX?: number };
      if (typeof native.locationX === "number") {
        selectAt(native.locationX);
        return;
      }
      if (typeof native.offsetX === "number") {
        selectAt(native.offsetX);
        return;
      }
      const pointer = event as unknown as {
        clientX: number;
        currentTarget?: { getBoundingClientRect?(): { left: number; width: number } };
      };
      const bounds = pointer.currentTarget?.getBoundingClientRect?.();
      if (bounds && bounds.width > 0) selectAt(pointer.clientX - bounds.left);
    },
    [selectAt],
  );
  const clearHover = useCallback(() => setHoverIndex(null), []);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 4 || Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderGrant: (event: GestureResponderEvent) =>
          selectAt(event.nativeEvent.locationX),
        onPanResponderMove: (event: GestureResponderEvent) =>
          selectAt(event.nativeEvent.locationX),
        onPanResponderTerminationRequest: () => true,
      }),
    [selectAt],
  );

  useEffect(() => {
    setHoverIndex(null);
  }, [range, metric, view]);

  const hoveredFraction =
    hoverIndex === null || bucketCount <= 1 ? 0 : hoverIndex / (bucketCount - 1);
  const tooltipOnRight = hoveredFraction > 0.55;
  // Keep the readout hidden until the pointer or a touch actually selects a
  // bucket; otherwise the chart shows a permanent tooltip for bucket zero.
  const hoveredAt = hoverIndex === null ? undefined : series[0]?.points[hoverIndex]?.at;

  const stack = useMemo(() => {
    const cumulative: number[][] = [];
    for (let sample = 0; sample < samples; sample++) {
      let running = 0;
      const row: number[] = [];
      for (let index = 0; index < series.length; index++) {
        row.push(running);
        running += plot.curves[index]?.[sample] ?? 0;
      }
      cumulative.push(row);
    }
    return cumulative;
  }, [plot.curves, samples, series.length]);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPlotWidth(event.nativeEvent.layout.width);
  }, []);

  const legend = (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6 }}>
      {series.map((entry, index) => (
        <View key={entry.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 2,
              backgroundColor: colors[index % colors.length],
            }}
          />
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11.5 }}>
            {entry.name}
          </Text>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 11.5,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatMetric(seriesTotal(entry, metric), metric)}
          </Text>
        </View>
      ))}
    </View>
  );

  const tooltip =
    hoveredAt === undefined ? null : (
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 6,
          [tooltipOnRight ? "right" : "left"]: 8,
          minWidth: 160,
          maxWidth: 220,
          padding: 9,
          gap: 4,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
          shadowColor: "#000",
          shadowOpacity: 0.25,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 6 },
          elevation: 6,
        }}
      >
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
          {formatBucket(hoveredAt, range)}
        </Text>
        {series.map((entry, index) => (
          <View key={entry.id} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: colors[index % colors.length],
              }}
            />
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: theme.colors.foregroundMuted, fontSize: 11 }}
            >
              {entry.name}
            </Text>
            <Text
              style={{
                color: theme.colors.foreground,
                fontSize: 11,
                fontWeight: "600",
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatMetric(valueOf(entry.points[hoverIndex ?? 0], metric), metric)}
            </Text>
          </View>
        ))}
        <View
          style={{
            marginTop: 2,
            paddingTop: 4,
            borderTopWidth: 1,
            borderColor: theme.colors.border,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>Total</Text>
          <Text
            style={{
              color: theme.colors.foreground,
              fontSize: 11,
              fontWeight: "600",
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatMetric(
              series.reduce(
                (sum, entry) => sum + valueOf(entry.points[hoverIndex ?? 0], metric),
                0,
              ),
              metric,
            )}
          </Text>
        </View>
      </View>
    );

  const yAxis = (
    <View style={{ width: 46, height: plotHeight }}>
      {plot.scale.ticks.map((tick) => (
        <Text
          key={tick}
          numberOfLines={1}
          style={{
            position: "absolute",
            right: 6,
            top: percentage(plotHeight - (tick / plot.scale.max) * plotHeight, plotHeight),
            transform: [{ translateY: -6 }],
            color: theme.colors.foregroundMuted,
            fontSize: 9.5,
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatMetric(tick, metric)}
        </Text>
      ))}
    </View>
  );

  const grid = (
    <>
      {plot.scale.ticks.map((tick) => (
        <View
          key={tick}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: percentage(plotHeight - (tick / plot.scale.max) * plotHeight, plotHeight),
            borderTopWidth: 1,
            borderColor: withAlpha(theme.colors.foregroundMuted, tick === 0 ? 0.25 : 0.12),
          }}
        />
      ))}
    </>
  );

  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: "row" }}>
        {yAxis}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ height: plotHeight, position: "relative" }}>
            {grid}
            {view === "curve" ? (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  flexDirection: "row",
                }}
                onLayout={handleLayout}
                accessibilityRole="image"
                accessibilityLabel={`Stacked ${metric} by harness across ${bucketCount} buckets`}
                onPointerEnter={trackHover}
                onPointerMove={trackHover}
                onPointerLeave={clearHover}
                {...panResponder.panHandlers}
              >
                {Array.from({ length: samples }, (_, sample) => (
                  <View key={sample} style={{ flex: 1, height: "100%", position: "relative" }}>
                    {series.map((entry, index) => {
                      const height = plot.curves[index]?.[sample] ?? 0;
                      const bottom = stack[sample]?.[index] ?? 0;
                      if (height <= 0) return null;
                      return (
                        <View
                          key={entry.id}
                          pointerEvents="none"
                          style={{
                            position: "absolute",
                            left: 0,
                            right: 0,
                            bottom: percentage(bottom, plot.scale.max),
                            height: percentage(height, plot.scale.max),
                            backgroundColor: withAlpha(
                              colors[index % colors.length],
                              index === series.length - 1 ? 0.3 : 0.18,
                            ),
                            borderTopWidth: 1.5,
                            borderTopColor: colors[index % colors.length],
                          }}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            ) : (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  flexDirection: "row",
                  alignItems: "flex-end",
                  gap: 1,
                }}
                onLayout={handleLayout}
                accessibilityRole="image"
                accessibilityLabel={`Stacked ${metric} bars by harness across ${bucketCount} buckets`}
                onPointerEnter={trackHover}
                onPointerMove={trackHover}
                onPointerLeave={clearHover}
                {...panResponder.panHandlers}
              >
                {Array.from({ length: bucketCount }, (_, bucket) => {
                  let running = 0;
                  const segments = series.map((entry, index) => {
                    const value = valueOf(entry.points[bucket], metric);
                    const bottom = running;
                    running += value;
                    return { entry, index, value, bottom };
                  });
                  return (
                    <View
                      key={bucket}
                      style={{
                        flex: 1,
                        height: "100%",
                        position: "relative",
                        backgroundColor:
                          hoverIndex === bucket
                            ? withAlpha(theme.colors.foregroundMuted, 0.1)
                            : undefined,
                        borderRadius: 2,
                      }}
                    >
                      {segments.map(({ entry, index, value, bottom }) =>
                        value <= 0 ? null : (
                          <View
                            key={entry.id}
                            pointerEvents="none"
                            style={{
                              position: "absolute",
                              left: 0,
                              right: 0,
                              bottom: percentage(bottom, plot.scale.max),
                              height: percentage(value, plot.scale.max),
                              backgroundColor: colors[index % colors.length],
                              borderTopLeftRadius:
                                bucket === 0 || index === series.length - 1 ? 1 : 0,
                              borderTopRightRadius:
                                bucket === bucketCount - 1 || index === series.length - 1 ? 1 : 0,
                            }}
                          />
                        ),
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            {hoverIndex === null ? null : (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${hoveredFraction * 100}%`,
                  width: 1,
                  backgroundColor: withAlpha(theme.colors.foregroundMuted, 0.5),
                }}
              />
            )}
            {tooltip}
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              marginTop: 7,
              gap: 8,
            }}
          >
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>
              {series[0]?.points[0]
                ? formatBucket(series[0].points[0].at, range)
                : "no data"}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>
              {series[0]?.points[Math.floor(bucketCount / 2)]
                ? formatBucket(
                    series[0].points[Math.floor(bucketCount / 2)].at,
                    range,
                  )
                : ""}
            </Text>
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>
              {series[0]?.points[bucketCount - 1]
                ? formatBucket(series[0].points[bucketCount - 1].at, range)
                : ""}
            </Text>
          </View>
        </View>
      </View>
      {legend}
      {series.length === 0 ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Icon name="ChartNoAxesColumn" size={14} color={theme.colors.foregroundMuted} />
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            No activity in this window.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
