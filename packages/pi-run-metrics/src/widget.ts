import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const minimumWidth = 0;

class RunMetricsWidget implements Component {
	private readonly text: () => string;

	constructor(text: () => string) {
		this.text = text;
	}

	render(width: number): string[] {
		const line = truncateToWidth(this.text().replace(/[\r\n]/gu, " "), Math.max(minimumWidth, width));
		return [" ".repeat(Math.max(minimumWidth, width - visibleWidth(line))) + line];
	}

	invalidate(): void {}
}

export { RunMetricsWidget };
