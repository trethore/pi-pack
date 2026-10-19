import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getPackageDir, Theme, type ThemeToken } from "@earendil-works/pi-coding-agent";

export function createTestTheme(): Theme {
  const path = join(getPackageDir(), "dist/modes/interactive/theme/dark.json");
  const builtin = JSON.parse(readFileSync(path, "utf8")) as { colors: Record<ThemeToken, unknown> };
  const colors = Object.fromEntries(Object.keys(builtin.colors).map((token) => [token, "#abcdef"])) as Record<
    ThemeToken,
    string
  >;
  return new Theme(colors, colors, "truecolor");
}
