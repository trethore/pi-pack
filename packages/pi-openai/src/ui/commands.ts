import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { Destination, extensionName } from "#src/constants";
import { choices, isSetting, parseSetting, settingNames, type Setting, type Settings } from "#src/config/settings";
import { isScopeName, scopeNames, type ScopeName } from "#src/config/scopes";

export const Command = {
  STATUS: "status",
  SET: "set",
  RESET: "reset",
  SAVE: "save",
} as const;

export type Command =
  | { type: typeof Command.STATUS }
  | { type: typeof Command.SET; setting: Setting; override: Partial<Settings>; scope?: ScopeName }
  | { type: typeof Command.RESET; setting: Setting | undefined; scope?: ScopeName; allScopes?: true }
  | { type: typeof Command.SAVE; destination: Destination | undefined; scope?: ScopeName };

const commandNames = [Command.STATUS, ...settingNames, Command.RESET, Command.SAVE];
const usage = `Use /${extensionName} [status | <setting> <value> | reset [setting] | save [project|global]]. Set/reset/save accept --scope <${scopeNames.join("|")}>; reset also accepts --all-scopes.`;

function saveCommand(destination: string | undefined): Command {
  if (destination !== undefined && destination !== Destination.PROJECT && destination !== Destination.GLOBAL) {
    throw new Error(usage);
  }
  return { type: Command.SAVE, destination };
}

function resetCommand(setting: string | undefined): Command {
  if (setting !== undefined && !isSetting(setting)) {
    throw new Error(usage);
  }
  return { type: Command.RESET, setting };
}

function positionalCommand(parts: string[]): Command {
  const [name = Command.STATUS, argument, ...extra] = parts;
  if (extra.length > 0) {
    throw new Error(usage);
  }
  if (name === Command.SAVE) {
    return saveCommand(argument);
  }
  if (name === Command.RESET) {
    return resetCommand(argument);
  }
  if (name === Command.STATUS && argument === undefined) {
    return { type: Command.STATUS };
  }
  if (isSetting(name) && argument !== undefined) {
    return { type: Command.SET, setting: name, override: parseSetting(name, argument) };
  }
  throw new Error(usage);
}

interface Options {
  scope?: ScopeName;
  allScopes?: true;
}

function extractOptions(parts: string[]): { positional: string[]; options: Options } {
  const positional: string[] = [];
  const options: Options = {};
  for (let index = 0; index < parts.length; index++) {
    const token = parts[index] ?? "";
    if (token === "--scope") {
      const scope = parts[++index] ?? "";
      if (options.scope !== undefined || !isScopeName(scope)) {
        throw new Error(usage);
      }
      options.scope = scope;
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
    (command.type !== Command.RESET || command.setting !== undefined || options.scope !== undefined)
  ) {
    throw new Error(usage);
  }
  return { ...command, ...options };
}

function argumentsFor(name: string): readonly string[] {
  if (isSetting(name)) {
    return choices[name].map(String);
  }
  if (name === Command.RESET) {
    return settingNames;
  }
  if (name === Command.SAVE) {
    return [Destination.PROJECT, Destination.GLOBAL];
  }
  return [];
}

function validCompletion(parts: string[], value: string): boolean {
  try {
    const completed = [...parts, value, ...(value === "--scope" ? ["all"] : [])];
    const { positional } = extractOptions(completed);
    const name = positional[0] ?? "";
    if (parts.at(-1) === "--scope" && positional.length === 1 && isSetting(name)) {
      completed.push(String(choices[name][0]));
    }
    parseCommand(completed.join(" "));
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
    : parts.at(-1) === "--scope"
      ? scopeNames
      : [...argumentsFor(parts[0] ?? ""), "--scope", "--all-scopes"];
  const result = candidates
    .filter((value) => value.startsWith(fragment) && (root || validCompletion(parts, value)))
    .map((value) => ({ value: [...parts, value].join(" "), label: value }));
  return result.length > 0 ? result : null;
}
