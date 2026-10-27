import type { ExtensionContext, ExtensionWidgetOptions, Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { vi } from "vitest";

/** Execute widget factories without starting an interactive terminal. */
export function createWidgetHarness(theme: Partial<Theme>) {
	let component: Component | undefined;
	const requestRender = vi.fn<() => void>();
	// Widget factories in these tests only need requestRender and the supplied theme methods.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const tui = { requestRender } as unknown as TUI;
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const widgetTheme = theme as Theme;
	const setWidget = vi.fn<
		(
			key: string,
			content: Parameters<ExtensionContext["ui"]["setWidget"]>[1] | string[],
			options?: ExtensionWidgetOptions,
		) => void
	>((_key, content) => {
		component = typeof content === "function" ? content(tui, widgetTheme) : undefined;
	});
	function render(width = 80): string[] {
		if (!component) {
			throw new Error("No widget installed");
		}
		return component.render(width);
	}
	return { setWidget, requestRender, render };
}
