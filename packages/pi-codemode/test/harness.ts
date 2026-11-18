import codemode from "#src/index";
import {
	type ExtensionAPI,
	type ExtensionToolContext,
	SessionManager,
	type ToolLoadout,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

const READ = "read";
const BASH = "bash";
const HIDDEN_SEARCH = "mcp__docs__search";
const CALL_ID = "call-1";

function tool(name: string): ExtensionToolContext["tools"][number] {
	return {
		name,
		label: name,
		description: name,
		parameters: {},
		execute: vi.fn<ExtensionToolContext["tools"][number]["execute"]>(),
	};
}

type Mode = "on" | "only";
function registration(mode: Mode, sessionManager: SessionManager) {
	const registerTool = vi.fn<ExtensionAPI["registerTool"]>();
	const api = {
		registerTool,
		getSettings: () => ({ codemode: { mode } }),
		appendEntry: sessionManager.appendCustomEntry.bind(sessionManager),
	};
	// The extension only uses settings, tool registration and custom entries.
	// eslint-disable-next-line typescript/no-unsafe-type-assertion
	codemode(api as unknown as ExtensionAPI);
	const [definition] = registerTool.mock.lastCall ?? [];
	if (definition === undefined) {
		throw new Error("Missing tool registration");
	}
	return definition;
}
function createLoadout(tools: ExtensionToolContext["tools"]): ToolLoadout {
	return {
		callable: tools,
		registered: tools,
		declared: tools.filter((candidate) => candidate.name !== HIDDEN_SEARCH),
		getNamespace: () => undefined,
		getExposure(name) {
			if (name === HIDDEN_SEARCH) {
				return "deferred";
			}
			return "direct";
		},
		getPromptGuidelines: () => [],
	};
}
export const Harness = {
	create(mode: Mode = "on") {
		const sessionManager = SessionManager.inMemory();
		const definition = registration(mode, sessionManager);
		const executeTool = vi.fn<ExtensionToolContext["executeTool"]>();
		const tools = [{ ...tool(READ), outputSchema: {} }, { ...tool(BASH), outputSchema: {} }, tool(HIDDEN_SEARCH)];
		// These are the only session services available to the tool bridge.
		// eslint-disable-next-line typescript/no-unsafe-type-assertion
		const ctx = { tools, sessionManager, executeTool } as unknown as ExtensionToolContext;

		return {
			definition,
			loadout: createLoadout(tools),
			sessionManager,
			executeTool,
			run(this: void, code: string, signal?: AbortSignal) {
				return definition.execute(CALL_ID, { code }, signal, undefined, ctx);
			},
		};
	},
};
