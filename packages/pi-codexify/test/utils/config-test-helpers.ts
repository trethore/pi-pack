import { createConfigTestHelpers } from '@trethore/pi-shared/test/config-test-helpers.js';

const { importConfigWithHome, makeTempDir, writeGlobalConfig, writeProjectConfig } = createConfigTestHelpers({
  configFileName: 'pi-codexify.jsonc',
  importConfig: () => import('#pi-codexify/config/config.js'),
  tempPrefix: 'pi-codexify-test-',
});

export { importConfigWithHome, makeTempDir, writeGlobalConfig, writeProjectConfig };
