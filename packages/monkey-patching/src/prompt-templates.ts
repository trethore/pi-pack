import { AgentSession, VERSION, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { errorMessage } from "@pi-pack/utils/errors";
import { getTemplatePatch, type TemplateTransform } from "#src/template-patch";

export type { TemplateTransform, TemplateTransformEvent } from "#src/template-patch";

export function registerPromptTemplateTransform(ctx: ExtensionContext, transform: TemplateTransform): () => void {
  try {
    return getTemplatePatch(AgentSession.prototype, VERSION).add(ctx, transform);
  } catch (error) {
    ctx.ui.notify(`Template transformation disabled: ${errorMessage(error)}.`, "warning");
    return () => {};
  }
}
