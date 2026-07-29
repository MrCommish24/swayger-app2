/**
 * SwaygerMark — the brand logo mark (·/·) as a tintable SVG component.
 * Used as the tab bar icon for the Swaygers tab.
 *
 * Rendered as an inline ·/· mark where all three elements share the same
 * vertical center — like reading "dot slash dot" as text. The slash is a
 * gentle diagonal (~30°), not steep. Both dots are the same size and height.
 */
import React from "react";
import Svg, { Rect, Line } from "react-native-svg";

interface SwaygerMarkProps {
  color?: string;
  size?: number;
}

export default function SwaygerMark({ color = "#FFFFFF", size = 24 }: SwaygerMarkProps) {
  // All three elements are vertically centered at y=12 in a 24×24 viewBox.
  // Slash: gentle ~30° diagonal, from (7, 15) to (17, 9).
  // Dots: 4×4 squares centered at y=12, flanking the slash.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Left dot */}
      <Rect x="1" y="10" width="4" height="4" rx="0.5" fill={color} />
      {/* Slash — gentle diagonal, same visual center as the dots */}
      <Line
        x1="7"
        y1="15"
        x2="17"
        y2="9"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="square"
      />
      {/* Right dot */}
      <Rect x="19" y="10" width="4" height="4" rx="0.5" fill={color} />
    </Svg>
  );
}
