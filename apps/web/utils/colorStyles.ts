import React from "react";

/**
 * Centralized color styles utility for board components
 * Provides consistent color mapping across the application
 */

export type ColorName =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red";

export interface BaseColorStyles {
  bg: string;
  text: string;
  dot: string;
}

export interface ColorStylesWithBadge extends BaseColorStyles {
  badge: string;
}

export interface ColorStylesWithBorder {
  bg: string;
  text: string;
  border: string;
}

export interface ColorStylesMinimal {
  bg: string;
  text: string;
}

export interface ColorStylesBgDot {
  bg: string;
  dot: string;
}

/**
 * Base color map with RGB/RGBA values
 * This is the most commonly used format across board components
 */
const BASE_COLOR_MAP: Record<ColorName, BaseColorStyles> = {
  default: {
    bg: "var(--novel-highlight-gray)",
    text: "var(--novel-text-black)",
    dot: "var(--novel-text-gray)"
  },
  gray: {
    bg: "var(--novel-highlight-gray)",
    text: "var(--novel-text-black)",
    dot: "var(--novel-text-gray)"
  },
  brown: {
    bg: "var(--novel-highlight-brown)",
    text: "var(--novel-text-brown)",
    dot: "var(--novel-text-brown)"
  },
  orange: {
    bg: "var(--novel-highlight-orange)",
    text: "var(--novel-text-orange)",
    dot: "var(--novel-text-orange)"
  },
  yellow: {
    bg: "var(--novel-highlight-yellow)",
    text: "var(--novel-text-yellow)",
    dot: "var(--novel-text-yellow)"
  },
  green: {
    bg: "var(--novel-highlight-green)",
    text: "var(--novel-text-green)",
    dot: "var(--novel-text-green)"
  },
  blue: {
    bg: "var(--novel-highlight-blue)",
    text: "var(--novel-text-blue)",
    dot: "var(--novel-text-blue)"
  },
  purple: {
    bg: "var(--novel-highlight-purple)",
    text: "var(--novel-text-purple)",
    dot: "var(--novel-text-purple)"
  },
  pink: {
    bg: "var(--novel-highlight-pink)",
    text: "var(--novel-text-pink)",
    dot: "var(--novel-text-pink)"
  },
  red: {
    bg: "var(--novel-highlight-red)",
    text: "var(--novel-text-red)",
    dot: "var(--novel-text-red)"
  },
} as const;

/**
 * Get color styles with bg, text, and dot
 * This is the most common format used across board components
 */
export function getColorStyles(colorName: ColorName | string = "default"): BaseColorStyles {
  const color = (colorName in BASE_COLOR_MAP ? colorName : "default") as ColorName;
  return BASE_COLOR_MAP[color] || BASE_COLOR_MAP.default;
}

/**
 * Get color styles with badge (same as bg)
 * Used in boardView.tsx
 */
export function getColorStylesWithBadge(colorName: ColorName | string = "default"): ColorStylesWithBadge {
  const base = getColorStyles(colorName);
  return {
    ...base,
    badge: base.bg,
  };
}

/**
 * Get color styles with only bg and text (no dot)
 * Used in calendarCard.tsx and boardViewCard.tsx
 */
export function getColorStylesMinimal(colorName: ColorName | string = "default"): ColorStylesMinimal {
  const base = getColorStyles(colorName);
  return {
    bg: base.bg,
    text: base.text,
  };
}

/**
 * Get color styles with only bg and dot (no text)
 * Used in editSinglePropertyModal.tsx (but with Tailwind classes)
 */
export function getColorStylesBgDot(colorName: ColorName | string = "default"): ColorStylesBgDot {
  const base = getColorStyles(colorName);
  return {
    bg: base.bg,
    dot: base.dot,
  };
}

/**
 * Get color styles formatted for React style prop
 */
export function getColorStylesAsCss(colorName: ColorName | string = "default"): React.CSSProperties {
  const styles = getColorStyles(colorName);
  return {
    backgroundColor: styles.bg,
    color: styles.text,
  };
}

/**
 * Export the base color map for direct access if needed
 */
export { BASE_COLOR_MAP };

