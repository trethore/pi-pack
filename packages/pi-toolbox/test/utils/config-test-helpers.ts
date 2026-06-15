import { createConfigTestHelpers } from '@trethore/pi-shared/test/config-test-helpers.js';

const { importConfigWithHome, makeTempDir, writeGlobalConfig, writeProjectConfig } = createConfigTestHelpers({
  configFileName: 'pi-toolbox.jsonc',
  importConfig: () => import('#pi-toolbox/config/config.js'),
  tempPrefix: 'pi-toolbox-test-',
});

export { importConfigWithHome, makeTempDir, writeGlobalConfig, writeProjectConfig };
