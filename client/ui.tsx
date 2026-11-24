import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import type { ReactNode } from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type ViewStyle,
} from "react-native";
import { withAlpha } from "./palette";

export type HoverState = PressableStateCallbackType & { hovered?: boolean };

export function cardStyle(theme: PluginTheme, radius = 12): ViewStyle {
  return {
    borderRadius: radius,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  };
}

export function Segmented<Value extends string>({
  value,
  options,
  onChange,
  theme,
  label,
  compact = false,
}: {
  value: Value;
  options: ReadonlyArray<{ value: Value; label: string; icon?: string; accessibilityLabel?: string }>;
  onChange(value: Value): void;
  theme: PluginTheme;
  label: string;
  compact?: boolean;
}) {
  return (
    <View
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        alignItems: "center",
        padding: 3,
        gap: 2,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface0,
        flexShrink: 0,
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.accessibilityLabel ?? `${label}: ${option.label}`}
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ hovered }: HoverState) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: compact ? 8 : 10,
              paddingVertical: compact ? 5 : 6,
              borderRadius: 7,
              backgroundColor: selected
                ? theme.colors.foreground
                : hovered
                  ? theme.colors.surface2
                  : "transparent",
            })}
          >
            {option.icon ? (
              <Icon
                name={option.icon}
                size={13}
                color={selected ? theme.colors.surface0 : theme.colors.foregroundMuted}
              />
            ) : null}
            <Text
              style={{
                fontSize: 12,
                fontWeight: "600",
                color: selected ? theme.colors.surface0 : theme.colors.foregroundMuted,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({
  label,
  tone,
  theme,
}: {
  label: string;
  tone: "muted" | "success" | "warning" | "danger" | "accent";
  theme: PluginTheme;
}) {
  const color =
    tone === "success"
      ? theme.colors.statusSuccess
      : tone === "warning"
        ? theme.colors.statusWarning
        : tone === "danger"
          ? theme.colors.statusDanger
          : tone === "accent"
            ? theme.colors.accent
            : theme.colors.foregroundMuted;
  return (
    <View
      style={{
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: withAlpha(color, 0.32),
        backgroundColor: withAlpha(color, 0.12),
      }}
    >
      <Text style={{ fontSize: 10.5, fontWeight: "600", color }}>{label}</Text>
    </View>
  );
}

export function Meter({
  segments,
  theme,
  height = 4,
}: {
  segments: ReadonlyArray<{ key: string; value: number; color: string }>;
  theme: PluginTheme;
  height?: number;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  // A lone percentage segment would otherwise take all free space; pad it so
  // the track shows the remainder.
  const drawn =
    visible.length === 1 && visible[0].value < 100
      ? [...visible, { key: "__track", value: 100 - visible[0].value, color: "transparent" }]
      : visible;
  return (
    <View
      style={{
        flexDirection: "row",
        height,
        borderRadius: height,
        overflow: "hidden",
        backgroundColor: theme.colors.surface2,
      }}
    >
      {drawn.map((segment) => (
        <View
          key={segment.key}
          style={{ flex: segment.value, backgroundColor: segment.color }}
        />
      ))}
    </View>
  );
}

export function MetricCard({
  theme,
  label,
  value,
  hint,
  bar,
  compact,
}: {
  theme: PluginTheme;
  label: string;
  value: string;
  hint: string;
  bar?: { value: number; color: string };
  compact: boolean;
}) {
  return (
    <View
      style={{
        ...cardStyle(theme, 10),
        flexGrow: 1,
        flexBasis: compact ? 140 : 128,
        minWidth: 120,
        padding: compact ? 12 : 14,
        gap: 7,
      }}
    >
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 10,
          fontWeight: "600",
          letterSpacing: 0.7,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          color: theme.colors.foreground,
          fontSize: compact ? 20 : 22,
          fontWeight: "600",
          fontVariant: ["tabular-nums"],
        }}
      >
        {value}
      </Text>
      <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
        {hint}
      </Text>
      {bar ? <Meter theme={theme} segments={[{ key: label, ...bar }]} height={3} /> : null}
    </View>
  );
}

export function SectionHeader({
  title,
  subtitle,
  trailing,
  theme,
}: {
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  theme: PluginTheme;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "flex-end",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 10,
      }}
    >
      <View style={{ gap: 2, flexShrink: 1 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 16, fontWeight: "600" }}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>{subtitle}</Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

export function EmptyState({
  message,
  theme,
}: {
  message: string;
  theme: PluginTheme;
}) {
  return (
    <View style={{ paddingVertical: 28, alignItems: "center" }}>
      <Icon name="Inbox" size={22} color={theme.colors.foregroundMuted} />
      <Text style={{ marginTop: 8, color: theme.colors.foregroundMuted, fontSize: 12 }}>
        {message}
      </Text>
    </View>
  );
}
