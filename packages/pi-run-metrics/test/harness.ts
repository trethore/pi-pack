import runMetrics from "#src/index";
import { type RunMetricsWidget } from "#src/widget";
import { type ExtensionAPI, type ExtensionContext, type ExtensionEvent } from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

type Handler = (event: ExtensionEvent, ctx: ExtensionContext) => unknown;

const defaultWidth = 80;

const Harness = {
	create(hasUI = true) {
		const handlers = new Map<string, Handler>();
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
		runMetrics(api);
		return {
			on,
			setWidget,
			async emit(event: ExtensionEvent): Promise<void> {
				await handlers.get(event.type)?.(event, ctx);
			},
			text(): string | undefined {
				const [, content] = setWidget.mock.lastCall ?? [];
				if (content === undefined) {
					return undefined;
				}
				// This factory does not consume Pi's TUI or theme arguments.
				// eslint-disable-next-line typescript/no-unsafe-type-assertion
				const factory = content as () => RunMetricsWidget;
				const [line] = factory().render(defaultWidth);
				return line?.trim();
			},
		};
	},
};

export { Harness };
