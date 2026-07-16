import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHandyConfigPaths } from '#pi-handy/config/locations.js';

describe('pi-handy config locations', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('respects the Pi agent directory override', () => {
    // Arrange
    vi.stubEnv('PI_CODING_AGENT_DIR', '/tmp/custom-pi-agent');

    // Act
    const configPaths = getHandyConfigPaths('/tmp/project');

    // Assert
    expect(configPaths).toEqual([
      path.join('/tmp/custom-pi-agent', 'pi-handy.jsonc'),
      path.join('/tmp/project', '.pi', 'pi-handy.jsonc'),
    ]);
  });
});
