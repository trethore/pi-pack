import {
  createCodemodeExtension,
  type ExtensionAPI,
  type ToolDefinition,
  type ToolLoadout,
  type ToolLoadoutChanges,
} from "@earendil-works/pi-coding-agent";
import type { ToolMasks } from "./masks.ts";

function filterLoadout(loadout: ToolLoadout, masks: ToolMasks): ToolLoadout {
  return {
    ...loadout,
    declared: loadout.declared.filter((tool) => !masks.isMasked(tool.name)),
    callable: loadout.callable.filter((tool) => !masks.isMasked(`codemode.${tool.name}`)),
    registered: loadout.registered.filter((tool) => !masks.isMasked(`codemode.${tool.name}`)),
  };
}

function maskCodemode<TParams extends ToolDefinition["parameters"], TDetails, TState>(
  tool: ToolDefinition<TParams, TDetails, TState>,
  getMasks: () => ToolMasks,
): ToolDefinition<TParams, TDetails, TState> {
  return {
    ...tool,
    prepareLoadout(loadout): ToolLoadoutChanges {
      const masks = getMasks();
      const changes = tool.prepareLoadout?.(filterLoadout(loadout, masks));
      return {
        ...changes,
        hiddenDeclarations: [
          ...(changes?.hiddenDeclarations ?? []),
          ...loadout.declared.filter((declared) => masks.isMasked(declared.name)).map((declared) => declared.name),
        ],
      };
    },
    execute(toolCallId, params, signal, onUpdate, ctx) {
      const masks = getMasks();
      const filteredContext = {
        ...ctx,
        tools: ctx.tools.filter((nested) => !masks.isMasked(`codemode.${nested.name}`)),
        executeTool: (name: string, args: unknown, options?: Parameters<typeof ctx.executeTool>[2]) => {
          if (getMasks().isMasked(`codemode.${name}`)) {
            throw new Error(`pi-toolmask: codemode.${name} is disabled`);
          }
          return ctx.executeTool(name, args, options);
        },
      };
      return tool.execute(toolCallId, params, signal, onUpdate, filteredContext);
    },
  };
}

export function registerMaskedCodemode(pi: ExtensionAPI, getMasks: () => ToolMasks): void {
  // Pi's replaceable built-in yields to this tool; retain its sandbox, renderers, and settings.
  const factory = createCodemodeExtension();
  void factory({
    ...pi,
    registerTool: (tool) => pi.registerTool(maskCodemode(tool, getMasks)),
  });
}
