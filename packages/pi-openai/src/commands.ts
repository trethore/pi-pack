import type { AutocompleteItem } from "@earendil-works/pi-tui";
import { Destination, extensionName } from "#src/constants";
import { choices, isSetting, parseSetting, settingNames, type Setting, type Settings } from "#src/settings";

export const Command = {
  STATUS: "status",
  SET: "set",
  RESET: "reset",
  SAVE: "save",
} as const;

export type Command =
  | { type: typeof Command.STATUS }
  | { type: typeof Command.SET; setting: Setting; override: Partial<Settings> }
  | { type: typeof Command.RESET; setting: Setting | undefined }
  | { type: typeof Command.SAVE; destination: Destination | undefined };

const commandNames = [Command.STATUS, ...settingNames, Command.RESET, Command.SAVE];
const usage = `Use /${extensionName} [${Command.STATUS} | <setting> <value> | ${Command.RESET} [setting] | ${Command.SAVE} [${Destination.PROJECT}|${Destination.GLOBAL}]].`;

function saveCommand(destination: string | undefined): Command {
  if (destination !== undefined && destination !== Destination.PROJECT && destination !== Destination.GLOBAL)
    throw new Error(usage);
  return { type: Command.SAVE, destination };
}

function resetCommand(setting: string | undefined): Command {
  if (setting !== undefined && !isSetting(setting)) throw new Error(usage);
  return { type: Command.RESET, setting };
}

export function parseCommand(args: string): Command {
  const [name = Command.STATUS, argument, ...extra] = args.trim().split(/\s+/).filter(Boolean);
  if (extra.length > 0) throw new Error(usage);
  if (name === Command.SAVE) return saveCommand(argument);
  if (name === Command.RESET) return resetCommand(argument);
  if (name === Command.STATUS && argument === undefined) return { type: Command.STATUS };
  if (isSetting(name) && argument !== undefined)
    return { type: Command.SET, setting: name, override: parseSetting(name, argument) };
  throw new Error(usage);
}

function argumentsFor(name: string): string[] {
  if (isSetting(name)) return choices[name].map(String);
  if (name === Command.RESET) return settingNames;
  if (name === Command.SAVE) return [Destination.PROJECT, Destination.GLOBAL];
  return [];
}

export function completeArguments(prefix: string): AutocompleteItem[] | null {
  const parts = prefix.trimStart().split(/\s+/);
  const [name = "", argument = ""] = parts;
  if (parts.length > 2) return null;
  const root = parts.length === 1;
  const candidates = root ? commandNames : argumentsFor(name);
  const result = candidates
    .filter((value) => value.startsWith(root ? name : argument))
    .map((value) => ({
      value: root ? value : `${name} ${value}`,
      label: value,
    }));
  return result.length > 0 ? result : null;
}
