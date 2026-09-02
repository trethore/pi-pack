import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createActiveConfig } from '@trethore/shared/config/active-config.js';

import { loadConfig } from '#src/config/config.js';
import { registerNotificationFeature } from '#src/core/notification.js';

export default function piNotify(pi: ExtensionAPI): void {
  const activeConfig = createActiveConfig(pi, loadConfig);
  registerNotificationFeature(pi, activeConfig);
}
