import { type Component, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

const MINIMUM_WIDTH = 0;
const SPACE = " ";

class RunMetricsWidget implements Component {
	private readonly text: () => string;

	constructor(text: () => string) {
		this.text = text;
	}

	render(width: number): string[] {
		const line = truncateToWidth(this.text().replace(/[\r\n]/gu, SPACE), Math.max(MINIMUM_WIDTH, width));
		return [SPACE.repeat(Math.max(MINIMUM_WIDTH, width - visibleWidth(line))) + line];
	}

	invalidate(): void {}
}

export { RunMetricsWidget };
