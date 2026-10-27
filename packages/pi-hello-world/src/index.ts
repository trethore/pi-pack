import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function helloWorld(pi: ExtensionAPI): void {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.notify("hello world", "info");
	});
}
