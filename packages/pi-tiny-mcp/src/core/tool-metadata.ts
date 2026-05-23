import type { ServerConfig, ToolPrefix } from '#src/config/schema.js';
import { resourceNameToToolName, resourceUriToToolSuffix } from '#src/core/resource-tools.js';
import type { McpResource, McpTool, ToolMetadata } from '#src/core/types.js';
import { formatToolName, isToolExcluded } from '#src/utils/names.js';

export function buildToolMetadata(
  tools: readonly McpTool[],
  resources: readonly McpResource[],
  definition: ServerConfig,
  serverName: string,
  prefix: ToolPrefix
): ToolMetadata[] {
  return uniquifyToolNames([
    ...buildMcpToolMetadata(tools, definition, serverName, prefix),
    ...buildResourceToolMetadata(resources, definition, serverName, prefix),
  ]);
}

export function findToolByName(
  metadataByServer: ReadonlyMap<string, ToolMetadata[]>,
  toolName: string
): ToolMetadata | undefined {
  for (const metadata of metadataByServer.values()) {
    const found = findToolInList(metadata, toolName);
    if (found) return found;
  }
  return undefined;
}

function findToolInList(
  metadata: readonly ToolMetadata[] | undefined,
  toolName: string
): ToolMetadata | undefined {
  if (!metadata) return undefined;
  const exact = metadata.find((tool) => tool.name === toolName);
  if (exact) return exact;

  const normalized = toolName.replaceAll('-', '_');
  return metadata.find((tool) => tool.name.replaceAll('-', '_') === normalized);
}

export function formatSchema(schema: unknown, indent = '  '): string {
  if (!schema || typeof schema !== 'object') return `${indent}(no schema)`;

  const objectSchema = schema as Record<string, unknown>;
  if (objectSchema.type !== 'object' || !isRecord(objectSchema.properties)) {
    return objectSchema.type
      ? `${indent}(${String(objectSchema.type)})`
      : `${indent}(complex schema)`;
  }

  return formatObjectProperties(objectSchema.properties, objectSchema.required, indent);
}

function buildMcpToolMetadata(
  tools: readonly McpTool[],
  definition: ServerConfig,
  serverName: string,
  prefix: ToolPrefix
): ToolMetadata[] {
  return tools
    .filter(
      (tool) => tool.name && !isToolExcluded(tool.name, serverName, prefix, definition.excludeTools)
    )
    .map((tool) => ({
      name: formatToolName(tool.name, serverName, prefix),
      originalName: tool.name,
      serverName,
      description: tool.description ?? '',
      inputSchema: tool.inputSchema,
    }));
}

function buildResourceToolMetadata(
  resources: readonly McpResource[],
  definition: ServerConfig,
  serverName: string,
  prefix: ToolPrefix
): ToolMetadata[] {
  if (definition.exposeResources === false) return [];

  return resources
    .filter((resource) => resource.name && resource.uri)
    .map((resource) => ({ resource, baseName: `get_${resourceNameToToolName(resource.name)}` }))
    .filter(
      ({ baseName }) => !isToolExcluded(baseName, serverName, prefix, definition.excludeTools)
    )
    .map(({ resource, baseName }) => ({
      name: formatToolName(baseName, serverName, prefix),
      originalName: baseName,
      serverName,
      description: resource.description ?? `Read resource: ${resource.uri}`,
      resourceUri: resource.uri,
    }));
}

function uniquifyToolNames(metadata: ToolMetadata[]): ToolMetadata[] {
  const usedNames = new Set<string>();
  const duplicateCounts = new Map<string, number>();

  return metadata.map((tool) => {
    const key = toolNameKey(tool.name);
    const count = duplicateCounts.get(key) ?? 0;
    duplicateCounts.set(key, count + 1);

    if (!usedNames.has(key)) {
      usedNames.add(key);
      return tool;
    }

    const name = createUniqueToolName(tool, count + 1, usedNames);
    usedNames.add(toolNameKey(name));
    return { ...tool, name };
  });
}

function createUniqueToolName(
  tool: ToolMetadata,
  duplicateIndex: number,
  usedNames: ReadonlySet<string>
): string {
  const preferredSuffix = tool.resourceUri ? resourceUriToToolSuffix(tool.resourceUri) : '';
  const suffixes = [preferredSuffix, String(duplicateIndex)].filter(Boolean);

  for (const suffix of suffixes) {
    const candidate = `${tool.name}_${suffix}`;
    if (!usedNames.has(toolNameKey(candidate))) return candidate;
  }

  for (let index = duplicateIndex + 1; ; index += 1) {
    const candidate = `${tool.name}_${index}`;
    if (!usedNames.has(toolNameKey(candidate))) return candidate;
  }
}

function toolNameKey(name: string): string {
  return name.replaceAll('-', '_');
}

function formatObjectProperties(
  properties: Record<string, unknown>,
  requiredValue: unknown,
  indent: string
): string {
  const required = Array.isArray(requiredValue) ? requiredValue : [];
  const lines = Object.entries(properties).map(([name, propertySchema]) =>
    formatProperty(name, propertySchema, required.includes(name), indent)
  );
  return lines.length === 0 ? `${indent}(no parameters)` : lines.join('\n');
}

function formatProperty(name: string, schema: unknown, required: boolean, indent: string): string {
  if (!isRecord(schema)) return `${indent}${name}${required ? ' *required*' : ''}`;

  const parts = [`${indent}${name}`];
  const typeName = getPropertyTypeName(schema);
  if (typeName) parts.push(`(${typeName})`);
  if (required) parts.push('*required*');
  if (typeof schema.description === 'string') parts.push(`- ${schema.description}`);
  if (schema.default !== undefined) parts.push(`[default: ${JSON.stringify(schema.default)}]`);
  return parts.join(' ');
}

function getPropertyTypeName(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.enum))
    return `enum: ${schema.enum.map((value) => JSON.stringify(value)).join(', ')}`;
  if (Array.isArray(schema.type)) return schema.type.join(' | ');
  if (schema.type) return String(schema.type);
  if (schema.anyOf || schema.oneOf) return 'union';
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
