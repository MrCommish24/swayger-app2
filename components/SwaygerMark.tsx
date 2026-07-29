/**
 * SwaygerMark — the brand logo mark (·/·) as a tintable SVG component.
 * Used as the tab bar icon for the Swaygers tab.
 *
 * Two small filled squares flanking a diagonal slash, centered vertically
 * in the viewBox so the mark sits balanced in the tab bar.
 */
import React from "react";
import Svg, { Rect, Line } from "react-native-svg";

interface SwaygerMarkProps {
  color?: string;
  size?: number;
}

export default function SwaygerMark({ color = "#FFFFFF", size = 24 }: SwaygerMarkProps) {
  // The mark occupies y=8–16, centered at y=12 in a 24×24 box.
  // Slash spans 8px vertically over 11px horizontally — ~36° angle,
  // matching the brand mark proportions.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {/* Left dot — small filled square, vertically centered left */}
      <Rect x="1.5" y="8.5" width="3.5" height="3.5" rx="0.4" fill={color} />
      {/* Slash — proportional diagonal, centered in the viewBox */}
      <Line
        x1="6.5"
        y1="16"
        x2="17.5"
        y2="8"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="square"
      />
      {/* Right dot — small filled square, vertically centered right */}
      <Rect x="19" y="8.5" width="3.5" height="3.5" rx="0.4" fill={color} />
    </Svg>
  );
}
