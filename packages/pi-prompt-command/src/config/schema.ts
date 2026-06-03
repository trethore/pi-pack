import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';

export type PermissionDecision = 'allow' | 'deny';

export interface PromptCommandSurfacesConfig {
  system: boolean;
  appendSystem: boolean;
  promptTemplates: boolean;
  contextFiles: boolean;
  skills: boolean;
}

export interface PiPromptCommandConfig {
  enabled: boolean;
  surfaces: PromptCommandSurfacesConfig;
  timeoutMs: number;
  maxOutputBytes: number;
  cwd?: string;
  permissions: Record<string, PermissionDecision>;
}

export type PartialPromptCommandSurfacesConfig = Partial<
  Record<keyof PromptCommandSurfacesConfig, unknown>
>;

export type PartialPiPromptCommandConfig = Partial<{
  enabled: unknown;
  surfaces: PartialPromptCommandSurfacesConfig;
  timeoutMs: unknown;
  maxOutputBytes: unknown;
  cwd: unknown;
  permissions: unknown;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiPromptCommandConfig>;

export const defaultConfig: PiPromptCommandConfig = {
  enabled: true,
  surfaces: {
    system: true,
    appendSystem: true,
    promptTemplates: true,
    contextFiles: false,
    skills: false,
  },
  timeoutMs: 30_000,
  maxOutputBytes: 20_000,
  permissions: {
    '*': 'deny',
  },
};
