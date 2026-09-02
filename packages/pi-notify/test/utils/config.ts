import { createConfigTestHelpers } from '@trethore/shared/test/config-test-helpers.js';

export const { importConfigWithHome, makeTempDir, writeGlobalConfig, writeProjectConfig } = createConfigTestHelpers({
  configFileName: 'pi-notify.jsonc',
  tempPrefix: 'pi-notify-config-',
  importConfig: () => import('#pi-notify/config/config.js'),
});
