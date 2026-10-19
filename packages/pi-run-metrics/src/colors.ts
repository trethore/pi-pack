import type { Theme, ThemeToken } from "@earendil-works/pi-coding-agent";

export type WidgetColor = ThemeToken | `#${string}`;

export function isWidgetColor(value: unknown, theme: Pick<Theme, "colors">): value is WidgetColor {
  return typeof value === "string" && (isThemeToken(value, theme) || /^#[0-9a-fA-F]{6}$/.test(value));
}

export function isThemeToken(value: string, theme: Pick<Theme, "colors">): value is ThemeToken {
  return Object.hasOwn(theme.colors, value);
}
