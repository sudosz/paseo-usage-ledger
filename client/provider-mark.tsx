import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/ui";
import { Image, View } from "react-native";
import { isDarkTheme, withAlpha } from "./palette";
import { PROVIDER_LOGOS } from "./provider-logos";
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
  const logo = PROVIDER_LOGOS[mark.id];
  const background = logo
    ? logo.tone === "dark"
      ? "#1f1f23"
      : logo.tone === "light"
        ? "#f4f4f5"
        : withAlpha(color, alpha)
    : withAlpha(color, alpha);
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
        backgroundColor: background,
      }}
    >
      {logo ? (
        <Image
          source={{ uri: logo.uri }}
          resizeMode="contain"
          style={{ width: size * 0.72, height: size * 0.72 }}
        />
      ) : (
        <Icon name={mark.icon} size={Math.round(size * 0.62)} color={color} />
      )}
    </View>
  );
}
