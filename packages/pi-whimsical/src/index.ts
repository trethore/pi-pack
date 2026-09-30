import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.ts";
import { defaultMessages } from "./messages.ts";

export default function whimsical(pi: ExtensionAPI): void {
  let enabled = true;
  let messages = defaultMessages;
  let workingMessageSet = false;

  pi.on("session_start", async (_event, ctx) => {
    enabled = false;
    const config = await loadConfig(ctx.cwd);
    enabled = config.enabled;
    messages = config.messages.length > 0 ? config.messages : defaultMessages;
  });

  pi.on("turn_start", (_event, ctx) => {
    if (!enabled || !ctx.hasUI) return;
    const message = messages[Math.floor(Math.random() * messages.length)];
    ctx.ui.setWorkingMessage(message);
    workingMessageSet = true;
  });

  pi.on("turn_end", (_event, ctx) => {
    if (!workingMessageSet) return;
    ctx.ui.setWorkingMessage();
    workingMessageSet = false;
  });

  pi.on("session_shutdown", (_event, ctx) => {
    if (!workingMessageSet) return;
    ctx.ui.setWorkingMessage();
    workingMessageSet = false;
  });
}
