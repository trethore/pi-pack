import { homedir } from 'node:os';
import path from 'node:path';

export function interpolateEnvVars(value: string): string {
  return value
    .replaceAll(/\$\{(\w+)\}/g, (_, name: string) => process.env[name] ?? '')
    .replaceAll(/\$env:(\w+)/g, (_, name: string) => process.env[name] ?? '');
}

export function interpolateEnvRecord(values: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!values) return undefined;

  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    resolved[key] = interpolateEnvVars(value);
  }
  return resolved;
}

export function resolveConfigPath(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;

  const resolved = interpolateEnvVars(value);
  if (resolved === '~') return homedir();
  if (resolved.startsWith('~/') || resolved.startsWith('~\\')) {
    return path.join(homedir(), resolved.slice(2));
  }
  return resolved;
}

export function resolveProcessEnv(overrides?: Record<string, string>): Record<string, string> {
  const baseEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) baseEnv[key] = value;
  }

  const resolvedOverrides = interpolateEnvRecord(overrides);
  return resolvedOverrides ? { ...baseEnv, ...resolvedOverrides } : baseEnv;
}
