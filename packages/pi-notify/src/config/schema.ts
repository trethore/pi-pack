import type { LoadedExtensionConfig } from '@trethore/shared/config/config-file.js';
import { defineConfigSchema, z } from '@trethore/shared/config/schema.js';

import {
  AUTO_NOTIFICATION_PROTOCOL,
  notificationProtocolSettings,
  type NotificationProtocolSetting,
} from '#src/core/protocol.js';

export interface PiNotifyConfig {
  enabled: boolean;
  message: string;
  cooldown: number;
  unfocusedOnly: boolean;
  protocol: NotificationProtocolSetting;
}

export type LoadedConfig = LoadedExtensionConfig<PiNotifyConfig>;

export const defaultConfig: PiNotifyConfig = {
  enabled: true,
  message: 'Ready for input',
  cooldown: 90,
  unfocusedOnly: false,
  protocol: AUTO_NOTIFICATION_PROTOCOL,
};

export const messageSchema = defineConfigSchema(z.string(), 'expected string');
export const cooldownSchema = defineConfigSchema(z.number().nonnegative(), 'expected non-negative number');
export const notificationProtocolSchema = defineConfigSchema(
  z.enum(notificationProtocolSettings),
  'expected "auto", "osc777", "osc99", or "osc9"'
);
