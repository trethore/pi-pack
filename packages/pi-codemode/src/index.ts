import { Run } from "#src/run";
import { Tools } from "#src/runtime/tools";
import { CODEMODE_SOURCE_GRAMMAR } from "@earendil-works/pi-codemode";
import { type ExtensionAPI, highlightCode } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

const NO_PADDING = 0;
const ONLY_MODE = "only";
const parameters = Type.Object({ code: Type.String() });

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
		prepareLoadout: (loadout) => Tools.loadout(loadout, pi.getSettings().codemode?.mode === ONLY_MODE),
		renderCall({ code }, theme, { lastComponent }) {
			let label = theme.fg("toolTitle", theme.bold(Tools.name));
			if (code) {
				label += `\n${highlightCode(code, "javascript").join("\n")}`;
			}
			if (lastComponent instanceof Text) {
				lastComponent.setText(label);
				return lastComponent;
			}
			return new Text(label, NO_PADDING, NO_PADDING);
		},
		// Pi supplies the execution context as the fifth tool argument.
		// eslint-disable-next-line max-params
		execute(_id, { code }, signal, _onUpdate, ctx) {
			return Run.execute({ code, signal, ctx, pi });
		},
	});
}
