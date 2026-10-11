import type { ModelRegistry, ToolNamespace } from "@earendil-works/pi-coding-agent";
import type { Static } from "typebox";
import type { codemodeSchema } from "#src/tool";
type CodemodeMode = "on" | "only";

export interface CodemodeStoreEntryData {
  set: Record<string, unknown>;
  delete: string[];
}

/** The part of the model registry that scripts reach through `models`. */
export type CodemodeModelRuntime = Pick<
  ModelRegistry,
  "getModelsOfType" | "getAvailableOfType" | "getModelOfType" | "classify" | "generateImages"
>;

export interface CodemodeToolOptions {
  /** Namespace of a tool, for `searchTools()` ranking and its `namespace` filter. */
  getToolNamespace?: (toolName: string) => ToolNamespace | undefined;
  /** Prompt guidelines of every tool, by tool name, shown with declarations by `describeTool()` and `ALL_TOOLS`. */
  getToolGuidelines?: () => ReadonlyMap<string, readonly string[]>;
  /**
   * Expose the `models` namespace to scripts, backed by the session's model registry
   * (`ctx.modelRegistry`). Without it, `models` is not declared.
   */
  models?: boolean;
  /**
   * Persists `store()` writes as a session custom entry. Without it, writes last only for the
   * current script; `load()` still reads entries already on the branch.
   */
  appendEntry?: (customType: string, data: CodemodeStoreEntryData) => void;
  /** How the tool presents the loadout while active (the `codemode.mode` setting). Default: `on`. */
  getMode?: () => CodemodeMode;
  /** Token budget for tool declarations in the description. Default: {@link DEFAULT_CODEMODE_INLINE_BUDGET}. */
  getInlineBudget?: () => number | undefined;
}

export type CodemodeToolInput = Static<typeof codemodeSchema>;

type CodemodeNestedCallStatus = "running" | "ok" | "error" | "cancelled";

export interface CodemodeNestedCall {
  /** Tool call id of the nested call, `<codemode call id>/<n>`. */
  id: string;
  name: string;
  /** Compact JSON of the arguments, truncated for display. */
  args: string;
  status: CodemodeNestedCallStatus;
  durationMs?: number;
  /** Error text, truncated for display. */
  error?: string;
  /** Cost in USD of a `models.*` call that reported usage. */
  cost?: number;
}

export interface CodemodeToolDetails {
  calls: CodemodeNestedCall[];
  /** Temp file with the full text output, when the output was truncated. */
  fullOutputPath?: string;
}
