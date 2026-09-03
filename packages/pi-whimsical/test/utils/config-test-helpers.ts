import { createConfigTestHelpers } from '@trethore/shared/test/config-test-helpers.js';

export const { importConfigWithHome, makeTempDir, writeGlobalConfig, writeProjectConfig } = createConfigTestHelpers({
  configFileName: 'pi-whimsical.jsonc',
  tempPrefix: 'pi-whimsical-config-',
  importConfig: () => import('#pi-whimsical/config/config.js'),
});
