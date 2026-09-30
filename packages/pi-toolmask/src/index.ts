import type { ExtensionAPI, ToolCallEventResult } from "@earendil-works/pi-coding-agent";
import { registerMaskedCodemode } from "./codemode.ts";
import { disabledConfig, loadConfig } from "./config.ts";
import { ToolMasks } from "./masks.ts";

export default function toolmask(pi: ExtensionAPI): void {
  let config = disabledConfig;
  let masks = new ToolMasks(config);
  const removedTools = new Set<string>();
  const codemodeCalls = new Set<string>();

  function applyMasks(): void {
    const active = pi.getActiveTools();
    const codemodeActive = active.includes("codemode") && !masks.isMasked("codemode");
    const exposure = new Map(pi.getAllTools().map((tool) => [tool.name, tool.exposure]));
    const keepNested = (name: string): boolean =>
      codemodeActive && exposure.get(name) === "direct" && !masks.isMasked(`codemode.${name}`);
    // Re-enforcement can restore an originally active tool when codemode is activated later.
    const candidates = [...new Set([...active, ...[...removedTools].filter(keepNested)])];
    const retained = candidates.filter((name) => {
      // A direct tool can stay callable in codemode while its top-level declaration is hidden.
      if (!masks.isMasked(name) || keepNested(name)) {
        removedTools.delete(name);
        return true;
      }
      removedTools.add(name);
      return false;
    });
    pi.setActiveTools(retained);
  }

  registerMaskedCodemode(pi, () => masks);

  pi.on("session_start", async (_event, ctx) => {
    config = disabledConfig;
    masks = new ToolMasks(config);
    removedTools.clear();
    codemodeCalls.clear();
    config = await loadConfig(ctx.cwd);
    masks = new ToolMasks(config);
    applyMasks();
  });

  pi.on("before_agent_start", () => {
    if (config.enforceBeforeAgentStart) {
      applyMasks();
    }
  });

  pi.on("tool_call", (event): ToolCallEventResult | undefined => {
    const nestedCodemode = event.parentToolCallId !== undefined && codemodeCalls.has(event.parentToolCallId);
    const name = nestedCodemode ? `codemode.${event.toolName}` : event.toolName;
    if ((event.parentToolCallId === undefined || nestedCodemode) && masks.isMasked(name)) {
      return { block: true, reason: `pi-toolmask: ${name} is disabled` };
    }
    if (event.toolName === "codemode") {
      codemodeCalls.add(event.toolCallId);
    }
    return undefined;
  });

  pi.on("tool_execution_end", (event) => {
    codemodeCalls.delete(event.toolCallId);
  });

  pi.on("session_shutdown", (event) => {
    if (event.reason === "reload") {
      // Restore only tools removed here before Pi carries its active set into the new runtime.
      masks = new ToolMasks(disabledConfig);
      pi.setActiveTools([...new Set([...pi.getActiveTools(), ...removedTools])]);
    }
  });
}
