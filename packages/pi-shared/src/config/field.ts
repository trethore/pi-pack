export function readBooleanField(
  value: unknown,
  extensionName: string,
  label: string,
  configPath: string,
  errors: string[]
): boolean | undefined {
  if (typeof value === 'boolean') return value;

  errors.push(
    `${extensionName} config ignored invalid ${label} value in ${configPath}; expected boolean.`
  );
  return undefined;
}
