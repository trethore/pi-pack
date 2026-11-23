import { Output } from "#src/runtime/output";
import { Script } from "#src/runtime/script";
import { Store } from "#src/runtime/store";
import { Tools } from "#src/runtime/tools";
import { CodemodeSandbox, parseCodemodeSource } from "@earendil-works/pi-codemode";
import type { ExtensionAPI, ExtensionToolContext } from "@earendil-works/pi-coding-agent";

const MEMORY_LIMIT_BYTES = 134_217_728; // 128 MiB

interface RunRequest {
	code: string;
	signal: AbortSignal | undefined;
	ctx: ExtensionToolContext;
	pi: Pick<ExtensionAPI, "appendEntry">;
}

function abortOptions(signal?: AbortSignal): { signal?: AbortSignal } {
	if (signal !== undefined) {
		return { signal };
	}
	return {};
}

export const Run = {
	async execute({ code, signal, ctx, pi }: RunRequest) {
		const source = parseCodemodeSource(code);
		const sandbox = new CodemodeSandbox({ tools: Tools.bind(ctx), memoryLimitBytes: MEMORY_LIMIT_BYTES });
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
};
