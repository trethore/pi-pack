import type { LoadedExtensionConfig } from '@trethore/shared/config/config-file.js';
import { defineConfigSchema, z } from '@trethore/shared/config/schema.js';

import { defaultMessages } from '#src/config/messages.js';

export interface PiWhimsicalConfig {
  enabled: boolean;
  messages: string[];
}

export type LoadedConfig = LoadedExtensionConfig<PiWhimsicalConfig>;

export const defaultConfig: PiWhimsicalConfig = {
  enabled: true,
  messages: [...defaultMessages],
};

export const messagesSchema = defineConfigSchema(
  z.array(z.string().min(1)).min(1).nullable(),
  'expected null or a non-empty array of non-empty strings'
);
