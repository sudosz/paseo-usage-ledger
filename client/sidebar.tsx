import type {
  PluginPopoverProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon, SidebarRow } from "@getpaseo/plugin/client/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Pressable,
  Text,
  View,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
} from "react-native";
import { summary } from "../shared/contracts";
import { formatAgo, formatPct, formatTokens, formatUsd, share } from "./format";
import { harnessColor, withAlpha } from "./palette";
import { Chip, Meter, cardStyle } from "./ui";

type HoverState = PressableStateCallbackType & { hovered?: boolean };

const ICON_SIZE = 14;
const ICON_GAP = 6;
const TEXT_GAP = 8;
const WIDTH_FOR_COST = 120;
const WIDTH_FOR_METER = 170;
const MIN_METER_WIDTH = 24;

function useDailyUsage() {
  const rpc = useRpc(summary);
  return useQuery({
    queryKey: ["usage-ledger", "24h"],
    queryFn: () => rpc({ range: "24h" }),
    staleTime: 60_000,
    retry: 0,
    // The footer is always mounted. A two-minute aggregate check is cheap
    // because parsed JSONL files are cached by mtime and size.
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
}

/** Top-level sidebar entry so the dashboard is discoverable without the footer. */
export function UsageNavItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  return (
    <SidebarRow
      icon="ChartNoAxesCombined"
      label="Usage Ledger"
      active={currentScreen?.screenId === "usage-ledger"}
      onPress={() => openScreen({ screenId: "usage-ledger" })}
    />
  );
}

/** A ccusage-style footer row: icon, 24h tokens, cache meter, cost. */
export function UsageSidebarItem({
  theme,
  currentScreen,
  openPopover,
}: PluginSidebarItemProps) {
  const query = useDailyUsage();
  const [width, setWidth] = useState<number | null>(null);
  const data = query.data;
  const total = data?.totals;
  if (!data && !query.error) return null;

  const measured = width ?? WIDTH_FOR_COST;
  const cacheRate = total
    ? share(total.cacheRead, total.input + total.cacheRead + total.cacheWrite)
    : 0;
  const label = total
    ? `Usage last 24 hours: ${formatTokens(total.processed)} tokens, ${formatPct(cacheRate)} cached, ${formatUsd(total.cost)} estimated. Press for details.`
    : "Usage last 24 hours unavailable. Press to retry.";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: currentScreen?.screenId === "usage-ledger" }}
      onPress={() => openPopover(UsagePopover)}
      onLayout={(event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width)}
      style={({ hovered }: HoverState) => ({
        width: "100%",
        flexDirection: "row",
        alignItems: "center",
        overflow: "hidden",
        minHeight: 28,
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        backgroundColor: hovered ? theme.colors.surface2 : undefined,
      })}
    >
      <Icon name="Coins" size={ICON_SIZE} color={theme.colors.foregroundMuted} />
      {total ? (
        <>
          <Text
            numberOfLines={1}
            style={{
              marginLeft: ICON_GAP,
              color: theme.colors.foreground,
              fontSize: 12,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatTokens(total.processed)}
          </Text>
          {measured >= WIDTH_FOR_METER ? (
            <View style={{ flex: 1, minWidth: MIN_METER_WIDTH, marginLeft: TEXT_GAP }}>
              <Meter
                theme={theme}
                height={3}
                segments={[
                  { key: "cached", value: Math.max(0.5, cacheRate), color: theme.colors.accent },
                  {
                    key: "rest",
                    value: Math.max(0.5, 100 - cacheRate),
                    color: theme.colors.surface2,
                  },
                ]}
              />
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {measured >= WIDTH_FOR_COST ? (
            <Text
              numberOfLines={1}
              style={{
                marginLeft: TEXT_GAP,
                color: theme.colors.foregroundMuted,
                fontSize: 12,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatUsd(total.cost)}
            </Text>
          ) : null}
        </>
      ) : (
        <Text
          numberOfLines={1}
          style={{
            marginLeft: ICON_GAP,
            color: theme.colors.statusWarning,
            fontSize: 12,
          }}
        >
          Usage unavailable
        </Text>
      )}
    </Pressable>
  );
}

/** The footer's detail sheet: current 24h split, harness mix, and a way in. */
export function UsagePopover({ theme, layout, openScreen }: PluginPopoverProps) {
  const query = useDailyUsage();
  const data = query.data;
  const total = data?.totals;
  const rootStyle = {
    gap: 12,
    padding: layout.compact ? 16 : 14,
    width: layout.compact ? undefined : 330,
    backgroundColor: theme.colors.surface1,
  };

  if (!data || !total) {
    return (
      <View style={rootStyle}>
        <Text style={{ color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
          Usage Ledger
        </Text>
        <Text
          style={{
            color: query.error ? theme.colors.statusWarning : theme.colors.foregroundMuted,
            fontSize: 12,
          }}
        >
          {query.error
            ? query.error instanceof Error
              ? query.error.message
              : String(query.error)
            : "Reading the last 24 hours…"}
        </Text>
      </View>
    );
  }

  const prompt = total.input + total.cacheRead + total.cacheWrite;
  const cacheRate = share(total.cacheRead, prompt);
  const unpriced = data.models.filter((model) => !model.priced).length;

  return (
    <View style={rootStyle}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: theme.colors.foreground, fontSize: 15, fontWeight: "600" }}>
          Usage Ledger
        </Text>
        <Chip theme={theme} label="last 24h" tone="muted" />
      </View>

      <View style={{ gap: 2 }}>
        <Text
          style={{
            color: theme.colors.foreground,
            fontSize: 30,
            fontWeight: "700",
            letterSpacing: -0.6,
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatTokens(total.processed)}
        </Text>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
          processed tokens · {formatUsd(total.cost)} API-equivalent
        </Text>
      </View>

      <View style={{ gap: 6 }}>
        <Meter
          theme={theme}
          height={6}
          segments={[
            { key: "cached", value: total.cacheRead, color: theme.colors.accent },
            { key: "input", value: total.input, color: theme.colors.foregroundMuted },
            { key: "write", value: total.cacheWrite, color: theme.colors.statusWarning },
            { key: "output", value: total.output, color: theme.colors.statusSuccess },
          ]}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
            {formatPct(cacheRate)} cache hit
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
            {total.sessions} sessions
          </Text>
        </View>
      </View>

      <View style={{ gap: 7 }}>
        {data.harnesses.map((harness) => (
          <View key={harness.id} style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 2,
                backgroundColor: harnessColor(theme, harness.id),
              }}
            />
            <Text
              numberOfLines={1}
              style={{ flex: 1, color: theme.colors.foreground, fontSize: 11.5 }}
            >
              {harness.name}
            </Text>
            <Text
              style={{
                color: theme.colors.foreground,
                fontSize: 11.5,
                fontVariant: ["tabular-nums"],
              }}
            >
              {formatTokens(harness.processed)}
            </Text>
            <Text
              style={{
                width: 54,
                textAlign: "right",
                color: harness.pricedTokens === 0
                  ? theme.colors.statusWarning
                  : theme.colors.foregroundMuted,
                fontSize: 10.5,
                fontVariant: ["tabular-nums"],
              }}
            >
              {harness.pricedTokens === 0 ? "Unpriced" : formatUsd(harness.cost)}
            </Text>
          </View>
        ))}
        {data.harnesses.length === 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
            No usage in the last 24 hours.
          </Text>
        ) : null}
      </View>

      {unpriced > 0 ? (
        <View
          style={{
            ...cardStyle(theme, 8),
            padding: 8,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            borderColor: withAlpha(theme.colors.statusWarning, 0.32),
            backgroundColor: withAlpha(theme.colors.statusWarning, 0.08),
          }}
        >
          <Icon name="TriangleAlert" size={12} color={theme.colors.statusWarning} />
          <Text style={{ color: theme.colors.statusWarning, fontSize: 10.5 }}>
            {unpriced} model{unpriced === 1 ? "" : "s"} without a published rate.
          </Text>
        </View>
      ) : null}

      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ flex: 1, color: theme.colors.foregroundMuted, fontSize: 10.5 }}>
          Updated {formatAgo(data.generatedAt)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open the usage dashboard"
          onPress={() => openScreen({ screenId: "usage-ledger" })}
          style={({ hovered }: HoverState) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 4,
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 7,
            backgroundColor: hovered ? theme.colors.surface2 : theme.colors.surface0,
            borderWidth: 1,
            borderColor: theme.colors.border,
          })}
        >
          <Text style={{ color: theme.colors.foreground, fontSize: 11.5, fontWeight: "600" }}>
            Open dashboard
          </Text>
          <Icon name="ChevronRight" size={13} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
    </View>
  );
}
