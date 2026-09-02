import type { ExtensionAPI, Theme, ToolInfo } from '@earendil-works/pi-coding-agent';
import { Box, Text } from '@earendil-works/pi-tui';
import { isPlainObject } from '@trethore/shared/object.js';
import { formatKeybindingText } from '@trethore/shared/ui/keybindings.js';

const SYSTEM_PROMPT_ENTRY_TYPE = 'pi-handy-system-prompt';
const TOOL_SCHEMAS_ENTRY_TYPE = 'pi-handy-tool-schemas';
const SHOW_MODES = ['prompt', 'tools'] as const;

type NotificationType = 'info' | 'warning' | 'error' | 'success';
type ShowMode = (typeof SHOW_MODES)[number];

export function registerShowSyspromptCommand(pi: ExtensionAPI) {
  pi.registerEntryRenderer<string>(SYSTEM_PROMPT_ENTRY_TYPE, (entry, { expanded }, theme) => {
    const prompt = entry.data ?? '';
    return formatCollapsibleMessage('System prompt', prompt, expanded, theme);
  });

  pi.registerEntryRenderer<string>(TOOL_SCHEMAS_ENTRY_TYPE, (entry, { expanded }, theme) => {
    const schemas = entry.data ?? '';
    return formatCollapsibleMessage('Active tools', schemas, expanded, theme);
  });

  pi.registerCommand('showsysprompt', {
    description: 'Show the current system prompt and active tools',
    getArgumentCompletions: (prefix) => getShowSyspromptArgumentCompletions(prefix),
    handler: (args, ctx) => {
      handleShowSyspromptCommand(pi, args, ctx);
      return Promise.resolve();
    },
  });
}

export function handleShowSyspromptCommand(
  pi: Pick<ExtensionAPI, 'appendEntry' | 'getActiveTools' | 'getAllTools'>,
  args: string,
  ctx: {
    getSystemPrompt(): string;
    ui: {
      notify(message: string, type?: NotificationType): void;
    };
  }
): void {
  const modes = parseShowModes(args);
  if (!modes) {
    ctx.ui.notify('Usage: /showsysprompt [prompt|tools]', 'warning');
    return;
  }

  if (modes.includes('prompt')) {
    pi.appendEntry(SYSTEM_PROMPT_ENTRY_TYPE, ctx.getSystemPrompt());
  }

  if (modes.includes('tools')) {
    pi.appendEntry(TOOL_SCHEMAS_ENTRY_TYPE, getActiveToolSchemas(pi));
  }
}

export function getShowSyspromptArgumentCompletions(prefix: string) {
  const normalizedPrefix = prefix.trim().toLowerCase();
  return SHOW_MODES.filter((mode) => mode.startsWith(normalizedPrefix)).map((mode) => ({
    value: mode,
    label: mode,
    description: mode === 'prompt' ? 'Show system prompt only' : 'Show active tools only',
  }));
}

export function formatToolSchemas(tools: ToolInfo[]): string {
  if (tools.length === 0) return 'No active tools.';

  return tools
    .map((tool) => {
      const parameters = isPlainObject(tool.parameters) ? tool.parameters : {};
      const properties = isPlainObject(parameters.properties) ? parameters.properties : {};
      const required = new Set(
        Array.isArray(parameters.required)
          ? parameters.required.filter((value): value is string => typeof value === 'string')
          : []
      );
      const parameterNames = Object.keys(properties);
      const header = `${tool.name} - ${tool.description}`;
      if (parameterNames.length === 0) return `${header}\n  (no parameters)`;

      const params = parameterNames
        .map((name) => {
          const property = properties[name];
          const presence = required.has(name) ? 'required' : 'optional';
          const type = formatSchemaType(property);
          const description =
            isPlainObject(property) && typeof property.description === 'string' ? ` - ${property.description}` : '';
          return `  ${name}: ${type} [${presence}]${description}`;
        })
        .join('\n');

      return `${header}\n${params}`;
    })
    .join('\n\n');
}

function parseShowModes(args: string): ShowMode[] | undefined {
  const requestedMode = args.trim().toLowerCase();
  if (requestedMode.length === 0) return ['prompt', 'tools'];
  if (isShowMode(requestedMode)) return [requestedMode];
  return undefined;
}

function isShowMode(value: string): value is ShowMode {
  return value === 'prompt' || value === 'tools';
}

function getActiveToolSchemas(pi: Pick<ExtensionAPI, 'getActiveTools' | 'getAllTools'>): string {
  const activeTools = new Set(pi.getActiveTools());
  return formatToolSchemas(pi.getAllTools().filter((tool) => activeTools.has(tool.name)));
}

function formatCollapsibleMessage(title: string, content: string, expanded: boolean, theme: Theme) {
  const displayContent = normalizeLineEndings(content);
  const expansionKey = formatKeybindingText('app.tools.expand');
  const header = expanded
    ? formatMessageHeader(title, `${expansionKey} to collapse`, theme)
    : formatMessageHeader(title, `${countLines(displayContent)} lines, ${expansionKey} to expand`, theme);
  return formatMessageBox(expanded ? `${header}\n\n${displayContent}` : header, theme);
}

function formatMessageHeader(title: string, detail: string, theme: Theme) {
  return `${theme.fg('accent', theme.bold(title))}${theme.fg('dim', ` (${detail})`)}`;
}

function formatMessageBox(text: string, theme: Theme) {
  const box = new Box(1, 1, (value) => theme.bg('customMessageBg', value));
  box.addChild(new Text(text, 0, 0));
  return box;
}

function normalizeLineEndings(content: string) {
  return content.replaceAll(/\r\n?/g, '\n');
}

function countLines(content: string) {
  return content.length === 0 ? 0 : content.split('\n').length;
}

function formatSchemaType(schema: unknown): string {
  if (!isPlainObject(schema)) return 'any';
  if (Object.hasOwn(schema, 'const')) return formatSchemaLiteral(schema.const);
  if (Array.isArray(schema.enum)) return schema.enum.map((value) => formatSchemaLiteral(value)).join(' | ');
  if (Array.isArray(schema.anyOf)) return schema.anyOf.map((item) => formatSchemaType(item)).join(' | ');
  if (Array.isArray(schema.oneOf)) return schema.oneOf.map((item) => formatSchemaType(item)).join(' | ');
  if (Object.hasOwn(schema, 'items')) return `${formatSchemaType(schema.items)}[]`;
  const type = formatSchemaTypeProperty(schema.type);
  if (type !== undefined) return type;
  return 'any';
}

function formatSchemaLiteral(value: unknown): string {
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

function formatSchemaTypeProperty(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return value.join(' | ');
  return undefined;
}
