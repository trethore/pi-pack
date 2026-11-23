import { type CodemodeTool, renderToolSignature } from "@earendil-works/pi-codemode";
import type { ExtensionToolContext, ToolLoadout, ToolLoadoutChanges } from "@earendil-works/pi-coding-agent";
import dedent from "dedent";

const NAME = "codemode";
const DIRECT = "direct";

const TEXT_TYPE = "text";
const description = dedent`
	Run an async JavaScript body. Call await tools.<name>({ ...args }); QuickJS, no Node, filesystem or network globals.
	To limit output or runtime, put either or both options on the first line, for example:
	// @options: {"max_output_tokens": 2000, "timeout_ms": 30000}
	Use text(value), console.log(...) or top-level return to add output; exit() ends the script.
	Use image(await tools.read({ path })) to show a local image. image() takes image data, not a file path.
	Use store(key, value) and load(key) to keep JSON values across codemode calls.
	Filter ALL_TOOLS by name to discover other callable tools and their signatures.
`;

type Callable = ExtensionToolContext["tools"][number];

function signature(tool: Callable): string {
	return renderToolSignature({
		name: tool.name,
		inputSchema: { ...tool.parameters },
		outputSchema: { ...(tool.outputSchema ?? { type: "string" }) },
	});
}

function shouldList(exposure: string, hideDirect: boolean): boolean {
	return exposure === NAME || hideDirect;
}

export const Tools = {
	name: NAME,
	description,
	loadout(loadout: ToolLoadout, only: boolean): ToolLoadoutChanges {
		const hiddenDeclarations: string[] = [];
		const lines = [description];
		for (const tool of loadout.callable) {
			const exposure = loadout.getExposure(tool.name);
			const hideDirect = only && exposure === DIRECT;
			if (hideDirect) {
				hiddenDeclarations.push(tool.name);
			}
			if (shouldList(exposure, hideDirect)) {
				lines.push(signature(tool), ...loadout.getPromptGuidelines(tool.name));
			}
		}
		return { descriptions: { [NAME]: lines.join("\n") }, hiddenDeclarations };
	},
	bind(ctx: ExtensionToolContext): CodemodeTool[] {
		return ctx.tools.map((tool) => ({
			name: tool.name,
			description: `${tool.description}\n${signature(tool)}`,
			async execute(args, { signal }) {
				const { result, isError } = await ctx.executeTool(tool.name, args, { signal });
				const hasStructuredValue = tool.outputSchema !== undefined && result.structuredContent !== undefined;
				if (hasStructuredValue) {
					return result.structuredContent;
				}
				const text = result.content.filter((item) => item.type === TEXT_TYPE).map((item) => item.text).join("\n");
				if (isError) {
					throw new Error(text || `Tool ${tool.name} failed`);
				}
				return text;
			},
		}));
	},
};
