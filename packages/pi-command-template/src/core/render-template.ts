import { CommandCache } from '#src/core/command-cache.js';
import type {
  CommandTemplateRenderer,
  CommandRunnerOptions,
  RenderContext,
} from '#src/core/types.js';

const TEMPLATE_PATTERN = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

export function createCommandTemplateRenderer(
  options: CommandRunnerOptions
): CommandTemplateRenderer {
  const cache = new CommandCache(options);

  return {
    render: (content: string, context: RenderContext) =>
      renderCommandTemplates(content, cache, context),
    getDiagnostics: () => cache.getDiagnostics(),
  };
}

export function renderCommandTemplates(
  content: string,
  cache: Pick<CommandCache, 'getOutput'>,
  context?: RenderContext
): string {
  return content.replaceAll(TEMPLATE_PATTERN, (match, name: string) => {
    const output = cache.getOutput(name, context);
    return output === undefined ? match : output;
  });
}
