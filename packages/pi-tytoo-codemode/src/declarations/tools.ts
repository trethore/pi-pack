import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { CodemodeJsonSchema, CodemodeTool } from "#src/sandbox/types";
import { isRecord } from "#src/sandbox/values";
import { CODEMODE_TOOL_NAME } from "#src/constants";
const TEXT_OUTPUT_SCHEMA: CodemodeJsonSchema = { type: "string" };
/**
 * What a script sees of a tool: its description followed by its prompt guidelines, which the system
 * prompt only has for declared tools. Tools without an output schema resolve to their text output.
 */
export function toCodemodeDeclaration(
  tool: AgentTool,
  guidelines: readonly string[] = [],
): Omit<CodemodeTool, "execute"> {
  const bullets = guidelines.flatMap((guideline) => (guideline.trim() ? [`- ${guideline.trim()}`] : []));
  return {
    name: tool.name,
    description: bullets.length > 0 ? `${tool.description.trim()}\n\n${bullets.join("\n")}` : tool.description,
    inputSchema: isRecord(tool.parameters) ? tool.parameters : true,
    outputSchema: isRecord(tool.outputSchema) ? tool.outputSchema : TEXT_OUTPUT_SCHEMA,
  };
}

/** Tools a script may call: every given tool except the codemode tool itself. */
export function getCodemodeCallableTools(tools: readonly AgentTool[]): AgentTool[] {
  return tools.filter((tool) => tool.name !== CODEMODE_TOOL_NAME);
}
