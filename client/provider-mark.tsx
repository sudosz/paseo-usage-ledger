import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { View } from "react-native";
import { isDarkTheme, withAlpha } from "./palette";
import { detectProvider } from "./provider-rules";

/** A small auto-detected provider mark: brand color, Lucide glyph, no assets. */
export function ProviderMark({
  theme,
  input,
  size = 16,
}: {
  theme: PluginTheme;
  input: { harness?: string; provider?: string; model?: string };
  size?: number;
}) {
  const mark = detectProvider(input);
  const color = mark.id === "unknown" ? theme.colors.foregroundMuted : mark.color;
  const alpha = isDarkTheme(theme) ? 0.2 : 0.13;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: withAlpha(color, alpha),
      }}
    >
      <Icon name={mark.icon} size={Math.round(size * 0.62)} color={color} />
    </View>
  );
}
