import { readFile } from "node:fs/promises";
import { parseFrontmatter, type SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import { expandArguments, parseArguments } from "#src/prompts/arguments";
import type { Workspace } from "#src/workspace";

function isAllowedPrompt(command: SlashCommandInfo | undefined, projectTrusted: boolean): command is SlashCommandInfo {
  return command?.source === "prompt" && (command.sourceInfo.scope !== "project" || projectTrusted);
}

async function readPrompt(command: SlashCommandInfo, workspace: Workspace): Promise<string | undefined> {
  try {
    const source = await readFile(command.sourceInfo.path, "utf8");
    return parseFrontmatter(source).body;
  } catch {
    workspace.warnings.push("pi-script-templates: Could not read a prompt template; leaving its invocation unchanged.");
    return undefined;
  }
}

export async function expandPrompt(
  text: string,
  commands: SlashCommandInfo[],
  workspace: Workspace,
  projectTrusted: boolean,
): Promise<string | undefined> {
  const invocation = /^\/([^\s]+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!invocation || !workspace.templates) {
    return undefined;
  }

  const command = commands.find((candidate) => candidate.name === invocation[1]);
  if (!isAllowedPrompt(command, projectTrusted)) {
    return undefined;
  }

  const path = command.sourceInfo.path;
  let pending = workspace.prompts.get(path);
  if (!pending) {
    pending = readPrompt(command, workspace);
    workspace.prompts.set(path, pending);
  }

  const body = await pending;
  if (body === undefined || !/\{\{[a-zA-Z0-9_-]+\}\}/.test(body)) {
    return undefined;
  }

  const args = parseArguments(invocation[2] ?? "");
  const templates = workspace.templates;
  return expandArguments(body, args, (part) => templates.expand(part));
}
