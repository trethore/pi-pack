import { greet } from "#src/greet";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";

export default function helloWorld(pi: ExtensionAPI) {
	pi.on(Events.SessionStart, (_event, ctx) => {
		ctx.ui.notify(greet(), "info");
	});
}
