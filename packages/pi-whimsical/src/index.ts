import type { ExtensionAPI, ExtensionEvent } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.ts";
import { defaultMessages } from "./messages.ts";

const Events = {
  SessionStart: "session_start",
  TurnStart: "turn_start",
  TurnEnd: "turn_end",
  SessionShutdown: "session_shutdown",
} as const satisfies Record<string, ExtensionEvent["type"]>;

export default function whimsical(pi: ExtensionAPI): void {
  let enabled = true;
  let messages = defaultMessages;
  let workingMessageSet = false;

  pi.on(Events.SessionStart, async (_event, ctx) => {
    enabled = false;
    const config = await loadConfig(ctx.cwd);
    enabled = config.enabled;
    messages = config.messages.length > 0 ? config.messages : defaultMessages;
  });

  pi.on(Events.TurnStart, (_event, ctx) => {
    if (!enabled || !ctx.hasUI) return;
    const message = messages[Math.floor(Math.random() * messages.length)];
    ctx.ui.setWorkingMessage(message);
    workingMessageSet = true;
  });

  pi.on(Events.TurnEnd, (_event, ctx) => {
    if (!workingMessageSet) return;
    ctx.ui.setWorkingMessage();
    workingMessageSet = false;
  });

  pi.on(Events.SessionShutdown, (_event, ctx) => {
    if (!workingMessageSet) return;
    ctx.ui.setWorkingMessage();
    workingMessageSet = false;
  });
}
