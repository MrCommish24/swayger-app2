/**
 * SwaygerMark — the brand logo mark (·/·) as a tintable SVG component.
 * Used as the tab bar icon for the Swaygers tab.
 *
 * The mark consists of two small filled squares flanking a diagonal slash,
 * matching the Swayger brand system. Accepts `color` and `size` props so
 * it responds to active/inactive tinting exactly like Ionicons.
 */
import React from "react";
import Svg, { Rect, Line } from "react-native-svg";

interface SwaygerMarkProps {
  color?: string;
  size?: number;
}

export default function SwaygerMark({ color = "#FFFFFF", size = 24 }: SwaygerMarkProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Left dot — small filled square, top-left of the slash */}
      <Rect x="1" y="4" width="4.5" height="4.5" rx="0.5" fill={color} />
      {/* Slash — diagonal stroke from lower-left to upper-right */}
      <Line
        x1="6.5"
        y1="21"
        x2="17.5"
        y2="3"
        stroke={color}
        strokeWidth="2.6"
        strokeLinecap="square"
      />
      {/* Right dot — small filled square, top-right of the slash */}
      <Rect x="18.5" y="4" width="4.5" height="4.5" rx="0.5" fill={color} />
    </Svg>
  );
}
