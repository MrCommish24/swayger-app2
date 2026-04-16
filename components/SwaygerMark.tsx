import React from "react";
import { View, StyleSheet } from "react-native";
import Svg, { Rect, Polygon } from "react-native-svg";
import Colors from "@/constants/colors";

interface SwaygerMarkProps {
  size?: number;
  color?: string;
}

export default function SwaygerMark({ size = 40, color = Colors.dark.text }: SwaygerMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 80 80">
      <Rect x="9" y="34" width="12" height="12" rx="2" fill={color} />
      <Polygon points="25,55 36,60 55,25 44,20" fill={color} />
      <Rect x="59" y="34" width="12" height="12" rx="2" fill={color} />
    </Svg>
  );
}

interface SwaygerLogoProps {
  markSize?: number;
  markColor?: string;
  showTagline?: boolean;
}

export function SwaygerLogoStacked({ markSize = 48, markColor = Colors.dark.text, showTagline = true }: SwaygerLogoProps) {
  return (
    <View style={logoStyles.stacked}>
      <SwaygerMark size={markSize} color={markColor} />
    </View>
  );
}

const logoStyles = StyleSheet.create({
  stacked: {
    alignItems: "center",
    gap: 8,
  },
});
