import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createActiveConfig } from '@trethore/pi-shared/config/active-config.js';

import { loadConfig } from '#src/config/config.js';
import { registerToolResultPipeline } from '#src/features/tool-result-pipeline.js';

export default function piCut(pi: ExtensionAPI) {
  const activeConfig = createActiveConfig(pi, loadConfig);

  registerToolResultPipeline(pi, activeConfig);
}
