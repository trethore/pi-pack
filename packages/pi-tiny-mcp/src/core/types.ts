import type { Transport as McpTransport } from '@modelcontextprotocol/sdk/shared/transport.js';

import type { ServerConfig } from '#src/config/schema.js';

type Transport = McpTransport;

export interface McpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: unknown;
}

export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpContent {
  type: 'text' | 'image' | 'audio' | 'resource' | 'resource_link';
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: {
    uri: string;
    text?: string;
    blob?: string;
    mimeType?: string;
  };
  uri?: string;
  name?: string;
}

export interface McpResourceContent {
  uri: string;
  text?: string;
  blob?: string;
  mimeType?: string;
}

export interface ToolMetadata {
  name: string;
  originalName: string;
  serverName: string;
  description: string;
  inputSchema?: unknown;
  resourceUri?: string;
}

export interface ServerConnection {
  client: import('@modelcontextprotocol/sdk/client/index.js').Client;
  transport: Transport;
  definition: ServerConfig;
  tools: McpTool[];
  resources: McpResource[];
  lastUsedAt: number;
  inFlight: number;
  status: 'connected' | 'closed';
}
