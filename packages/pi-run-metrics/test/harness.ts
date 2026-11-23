import runMetrics from "#src/index";
import type { RunMetricsWidget } from "#src/widget";
import type { ExtensionAPI, ExtensionContext, ExtensionEvent, Theme } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

type Handler = (event: ExtensionEvent, ctx: ExtensionContext) => unknown;

const DEFAULT_WIDTH = 80;

const Harness = {
	async create(hasUI = true) {
		const handlers = new Map<string, Handler>();
		const fg = vi.fn<Theme["fg"]>((_color, text) => text);
		const setWidget = vi.fn<ExtensionContext["ui"]["setWidget"]>();
		const on = vi.fn<(event: string, handler: Handler) => () => boolean>((event, handler) => {
			handlers.set(event, handler);
			return () => handlers.delete(event);
		});
		// The extension only uses event registration, UI availability, and widget placement.
		// eslint-disable-next-line typescript/no-unsafe-type-assertion
		const api = { on } as unknown as ExtensionAPI;
		// eslint-disable-next-line typescript/no-unsafe-type-assertion
		const ctx = { hasUI, ui: { setWidget } } as unknown as ExtensionContext;
		await runMetrics(api);
		return {
			on,
			fg,
			setWidget,
			async emit(event: ExtensionEvent): Promise<void> {
				await handlers.get(event.type)?.(event, ctx);
			},
			text(): string | undefined {
				const [, content] = setWidget.mock.lastCall ?? [];
				if (content === undefined) {
					return undefined;
				}
				// Only the theme foreground function is used by the widget factory.
				// eslint-disable-next-line typescript/no-unsafe-type-assertion
				const factory = content as unknown as (tui: undefined, theme: Pick<Theme, "fg">) => RunMetricsWidget;
				const [line] = factory(undefined, { fg }).render(DEFAULT_WIDTH);
				return line?.trim();
			},
		};
	},
};

export { Harness };
