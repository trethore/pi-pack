import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export function colorize(theme: Theme, color: string): (text: string) => string {
	if (/^#[\da-f]{6}$/iu.test(color)) {
		const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
		return (text) => `\x1b[38;2;${channels.join(";")}m${text}\x1b[39m`;
	}
	// Pi validates theme token names at runtime, including tokens added in later versions.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const token = color as ThemeColor;
	theme.getFgAnsi(token);
	return (text) => theme.fg(token, text);
}

export function renderLine(text: string, width: number, paint: (text: string) => string): string[] {
	if (width <= 0) {
		return [""];
	}
	const clipped = truncateToWidth(text.replace(/[\r\n\t]/gu, " "), width);
	return [" ".repeat(Math.max(0, width - visibleWidth(clipped))) + paint(clipped)];
}
