import { defaultConfig, type PiTinyMcpConfig } from '#pi-tiny-mcp/config/schema.js';

interface TinyMcpConfigOverrides {
  servers?: PiTinyMcpConfig['servers'];
  metadataCache?: Partial<PiTinyMcpConfig['metadataCache']>;
}

export function createTinyMcpConfig(overrides: TinyMcpConfigOverrides = {}): PiTinyMcpConfig {
  return {
    ...defaultConfig,
    proxyTool: { ...defaultConfig.proxyTool },
    directTools: { ...defaultConfig.directTools },
    metadataCache: { ...defaultConfig.metadataCache, ...overrides.metadataCache },
    lifecycle: { ...defaultConfig.lifecycle },
    toolNames: { ...defaultConfig.toolNames },
    sources: { ...defaultConfig.sources },
    servers: overrides.servers ?? {},
  };
}
