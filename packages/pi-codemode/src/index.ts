import { Output } from "#src/output";
import { Script } from "#src/script";
import { Store } from "#src/store";
import { Tools } from "#src/tools";
import { CODEMODE_SOURCE_GRAMMAR, CodemodeSandbox, parseCodemodeSource } from "@earendil-works/pi-codemode";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const onlyMode = "only";
const memoryLimitBytes = 134_217_728; // 128 MiB
const parameters = Type.Object({ code: Type.String() });

function abortOptions(signal?: AbortSignal): { signal?: AbortSignal } {
	if (signal !== undefined) {
		return { signal };
	}
	return {};
}

export default function codemode(pi: ExtensionAPI): void {
	pi.registerTool({
		name: Tools.name,
		label: Tools.name,
		description: Tools.description,
		parameters,
		promptSnippet: "Run JavaScript against the session's tools",
		promptGuidelines: [
			"Use codemode to batch independent calls, chain results, or filter large output before returning it.",
		],
		defaultActive: false,
		exposure: "model-only",
		executionMode: "sequential",
		constrainedSampling: { type: "grammar", variants: { openai_lark: CODEMODE_SOURCE_GRAMMAR } },
		reachesTools: () => "all",
		prepareLoadout: (loadout) => Tools.loadout(loadout, pi.getSettings().codemode?.mode === onlyMode),
		// Pi supplies the execution context as the fifth tool argument.
		// eslint-disable-next-line max-params
		async execute(_id, { code }, signal, _onUpdate, ctx) {
			const source = parseCodemodeSource(code);
			const sandbox = new CodemodeSandbox({ tools: Tools.bind(ctx), memoryLimitBytes });
			try {
				const result = await sandbox.execute(Script.wrap(source.code), {
					store: Store.read(ctx.sessionManager.getBranch()),
					...abortOptions(signal),
					...source.options,
				});
				const output = await Output.result(result, source.options.maxOutputTokens);
				const persist = result.ok && !output.isError && Store.changed(result.storeWrites);
				if (persist) {
					pi.appendEntry(Store.entryType, result.storeWrites);
				}
				return output;
			} finally {
				await sandbox.close();
			}
		},
	});
}
