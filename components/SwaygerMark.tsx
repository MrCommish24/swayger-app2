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
  // Slash: steep ~65° diagonal, from (10, 18.5) to (14, 5.5).
  // Dots: 4×4 squares centered at y=12, flanking the slash.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Left dot */}
      <Rect x="2" y="10" width="4" height="4" rx="0.5" fill={color} />
      {/* Slash — steep diagonal, reads clearly as a dividing / */}
      <Line
        x1="10"
        y1="18.5"
        x2="14"
        y2="5.5"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="square"
      />
      {/* Right dot */}
      <Rect x="18" y="10" width="4" height="4" rx="0.5" fill={color} />
    </Svg>
  );
}
