import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { Destination, extensionName } from "#src/constants";
import { choices, isSetting, parseSetting, settingNames, type Setting, type Settings } from "#src/config/settings";
import { isScopeName, scopeNames, type ScopeName } from "#src/config/scopes";

export const Command = {
  STATUS: "status",
  SET: "set",
  UNDO: "undo",
  UNSET: "unset",
  SAVE: "save",
} as const;

export type Command =
  | { type: typeof Command.STATUS }
  | { type: typeof Command.SET; setting: Setting; override: Partial<Settings>; scope?: ScopeName; source?: Destination }
  | { type: typeof Command.UNDO; setting: Setting | undefined; scope?: ScopeName; allScopes?: true }
  | { type: typeof Command.UNSET; setting: Setting; scope?: ScopeName }
  | { type: typeof Command.SAVE; source?: Destination; scope?: ScopeName };

const commandNames = [Command.STATUS, ...settingNames, Command.UNDO, Command.UNSET, Command.SAVE];
const usage = `Use /${extensionName} [status | <setting> <value> | undo [setting] | unset <setting> | save]. Set/undo/unset/save accept --scope <${scopeNames.join("|")}>; set/save accept --source <project|global>; undo also accepts --all-scopes. Save options filter edits, never retarget them.`;

function undoCommand(setting: string | undefined): Command {
  if (setting !== undefined && !isSetting(setting)) {
    throw new Error(usage);
  }
  return { type: Command.UNDO, setting };
}

function unsetCommand(setting: string | undefined): Command {
  if (setting === undefined || !isSetting(setting)) {
    throw new Error(usage);
  }
  return { type: Command.UNSET, setting };
}

function positionalCommand(parts: string[]): Command {
  const [name = Command.STATUS, argument, ...extra] = parts;
  if (extra.length > 0) {
    throw new Error(usage);
  }
  if (name === Command.UNDO) {
    return undoCommand(argument);
  }
  if (name === Command.UNSET) {
    return unsetCommand(argument);
  }
  if ((name === Command.STATUS || name === Command.SAVE) && argument === undefined) {
    return { type: name };
  }
  if (isSetting(name) && argument !== undefined) {
    return { type: Command.SET, setting: name, override: parseSetting(name, argument) };
  }
  throw new Error(usage);
}

interface Options {
  scope?: ScopeName;
  source?: Destination;
  allScopes?: true;
}

function valueOption(options: Options, flag: string, value: string): void {
  if (flag === "--scope") {
    if (options.scope !== undefined || !isScopeName(value)) {
      throw new Error(usage);
    }
    options.scope = value;
  } else {
    if (options.source !== undefined || (value !== Destination.PROJECT && value !== Destination.GLOBAL)) {
      throw new Error(usage);
    }
    options.source = value;
  }
}

function extractOptions(parts: string[]): { positional: string[]; options: Options } {
  const positional: string[] = [];
  const options: Options = {};
  for (let index = 0; index < parts.length; index++) {
    const token = parts[index] ?? "";
    if (token === "--scope" || token === "--source") {
      valueOption(options, token, parts[++index] ?? "");
    } else if (token === "--all-scopes") {
      if (options.allScopes) {
        throw new Error(usage);
      }
      options.allScopes = true;
    } else {
      positional.push(token);
    }
  }
  return { positional, options };
}

export function parseCommand(args: string): Command {
  const { positional, options } = extractOptions(args.trim().split(/\s+/).filter(Boolean));
  const command = positionalCommand(positional);
  if (command.type === Command.STATUS) {
    if (Object.keys(options).length > 0) {
      throw new Error(usage);
    }
    return command;
  }
  if (
    options.allScopes &&
    (command.type !== Command.UNDO || command.setting !== undefined || options.scope !== undefined)
  ) {
    throw new Error(usage);
  }
  if (options.source !== undefined && command.type !== Command.SET && command.type !== Command.SAVE) {
    throw new Error(usage);
  }
  return { ...command, ...options };
}

function argumentsFor(name: string): readonly string[] {
  if (isSetting(name)) {
    return choices[name].map(String);
  }
  if (name === Command.UNDO || name === Command.UNSET) {
    return settingNames;
  }
  return [];
}

const optionValues = new Map<string, readonly string[]>([
  ["--scope", scopeNames],
  ["--source", [Destination.PROJECT, Destination.GLOBAL]],
]);

function completionCommand(parts: string[], value: string): string {
  const option = optionValues.get(value)?.[0];
  const completed = [...parts, value, ...(option === undefined ? [] : [option])];
  const { positional } = extractOptions(completed);
  const [name = ""] = positional;
  const completingOption = optionValues.has(parts.at(-1) ?? "");
  if (positional.length === 1) {
    if (isSetting(name) && completingOption) {
      completed.push(String(choices[name][0]));
    } else if (name === Command.UNSET) {
      completed.push("enabled");
    }
  }
  return completed.join(" ");
}

function validCompletion(parts: string[], value: string): boolean {
  try {
    parseCommand(completionCommand(parts, value));
    return true;
  } catch {
    return false;
  }
}

export function completeArguments(prefix: string): AutocompleteItem[] | null {
  const parts = prefix.trimStart().split(/\s+/);
  const fragment = parts.pop() ?? "";
  const root = parts.length === 0;
  const candidates = root
    ? commandNames
    : (optionValues.get(parts.at(-1) ?? "") ?? [
        ...argumentsFor(parts[0] ?? ""),
        "--scope",
        "--source",
        "--all-scopes",
      ]);
  const result = candidates
    .filter((value) => value.startsWith(fragment) && (root || validCompletion(parts, value)))
    .map((value) => ({ value: [...parts, value].join(" "), label: value }));
  return result.length > 0 ? result : null;
}
