export const BUILT_IN_COMMAND_NAMES = ['pi-find', 'pi-grep'] as const;

export type BuiltInCommandName = (typeof BUILT_IN_COMMAND_NAMES)[number];

const BUILT_IN_COMMAND_NAME_SET = new Set<string>(BUILT_IN_COMMAND_NAMES);

export function isBuiltInCommandName(value: string): value is BuiltInCommandName {
  return BUILT_IN_COMMAND_NAME_SET.has(value);
}
