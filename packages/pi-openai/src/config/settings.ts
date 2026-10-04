import { Destination, Feature, ReasoningSummary, ServiceTier, Verbosity } from "#src/constants";

export interface Settings {
  enabled: boolean;
  allowUnsupported: boolean;
  verbosity: Verbosity | null;
  reasoningSummary: ReasoningSummary | null;
  webSearch: boolean;
  serviceTier: ServiceTier;
}

export const Setting = {
  ENABLED: "enabled",
  ALLOW_UNSUPPORTED: "allowUnsupported",
  ...Feature,
} as const;
export type Setting = (typeof Setting)[keyof typeof Setting];

const Source = {
  DEFAULT: "default",
  GLOBAL: Destination.GLOBAL,
  PROJECT: Destination.PROJECT,
  ENVIRONMENT: "environment",
  COMMAND: "command",
} as const;
type Source = (typeof Source)[keyof typeof Source];
export type Layers = Record<Exclude<Source, typeof Source.DEFAULT>, Partial<Settings>>;
export interface EffectiveSettings {
  values: Settings;
  sources: Record<Setting, Source>;
}

export const settingNames: Setting[] = Object.values(Setting);

export const defaults: Readonly<Settings> = {
  enabled: true,
  allowUnsupported: false,
  verbosity: null,
  reasoningSummary: null,
  webSearch: false,
  serviceTier: ServiceTier.DEFAULT,
};

export const choices: { [K in Setting]: readonly Settings[K][] } = {
  enabled: [true, false],
  allowUnsupported: [true, false],
  verbosity: [...Object.values(Verbosity), null],
  reasoningSummary: [...Object.values(ReasoningSummary), null],
  webSearch: [true, false],
  serviceTier: Object.values(ServiceTier),
};

export const environmentNames: Record<Setting, string> = {
  enabled: "PI_OPENAI_ENABLED",
  allowUnsupported: "PI_OPENAI_ALLOW_UNSUPPORTED",
  verbosity: "PI_OPENAI_VERBOSITY",
  reasoningSummary: "PI_OPENAI_REASONING_SUMMARY",
  webSearch: "PI_OPENAI_WEB_SEARCH",
  serviceTier: "PI_OPENAI_SERVICE_TIER",
};

export function isSetting(value: string): value is Setting {
  return settingNames.some((name) => name === value);
}

function normalizeValue(key: Setting, value: unknown): unknown {
  return key === Setting.SERVICE_TIER && value === "fast" ? ServiceTier.PRIORITY : value;
}

function setValue<K extends Setting>(target: Partial<Pick<Settings, K>>, key: K, value: unknown): void {
  const normalized = normalizeValue(key, value);
  const valid = choices[key].find((choice) => choice === normalized);
  if (valid === undefined) {
    throw new Error(`${key} must be one of: ${choices[key].map(String).join(", ")}`);
  }
  target[key] = valid;
}

export function validateSettings(input: Record<string, unknown>): Partial<Settings> {
  const result: Partial<Settings> = {};
  for (const key of settingNames) {
    if (Object.hasOwn(input, key)) {
      setValue(result, key, input[key]);
    }
  }
  return result;
}

export function parseSetting(key: Setting, text: string): Partial<Settings> {
  const normalized = normalizeValue(key, text.trim());
  const value = choices[key].find((choice) => String(choice) === normalized);
  const result: Partial<Settings> = {};
  setValue(result, key, value);
  return result;
}

export function readEnvironment(environment: NodeJS.ProcessEnv): Partial<Settings> {
  const result: Partial<Settings> = {};
  for (const key of settingNames) {
    const name = environmentNames[key];
    const value = environment[name];
    if (value === undefined) {
      continue;
    }
    try {
      Object.assign(result, parseSetting(key, value));
    } catch {
      throw new Error(`${name} must be one of: ${choices[key].map(String).join(", ")}`);
    }
  }
  return result;
}

export function resolveSettings(layers: Layers): EffectiveSettings {
  const sources: Record<Setting, Source> = {
    enabled: Source.DEFAULT,
    allowUnsupported: Source.DEFAULT,
    verbosity: Source.DEFAULT,
    reasoningSummary: Source.DEFAULT,
    webSearch: Source.DEFAULT,
    serviceTier: Source.DEFAULT,
  };
  const order = [Source.COMMAND, Source.ENVIRONMENT, Source.PROJECT, Source.GLOBAL] as const;
  for (const key of settingNames) {
    sources[key] = order.find((source) => Object.hasOwn(layers[source], key)) ?? Source.DEFAULT;
  }
  return {
    values: { ...defaults, ...layers.global, ...layers.project, ...layers.environment, ...layers.command },
    sources,
  };
}
