import path from 'node:path';

import { getConfigPaths, getGlobalConfigPath } from '@trethore/pi-shared/config/locations.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('shared config locations', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('respects the Pi agent directory override', () => {
    vi.stubEnv('PI_CODING_AGENT_DIR', '/tmp/custom-pi-agent');

    const globalConfigPath = getGlobalConfigPath('extension.jsonc');
    const configPaths = getConfigPaths('/tmp/project', 'extension.jsonc');

    expect(globalConfigPath).toBe(path.join('/tmp/custom-pi-agent', 'extension.jsonc'));
    expect(configPaths).toEqual([
      path.join('/tmp/custom-pi-agent', 'extension.jsonc'),
      path.join('/tmp/project', '.pi', 'extension.jsonc'),
    ]);
  });
});
