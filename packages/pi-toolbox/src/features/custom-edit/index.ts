import { constants } from 'node:fs';
import {
  access as fsAccess,
  readFile as fsReadFile,
  writeFile as fsWriteFile,
} from 'node:fs/promises';
import path from 'node:path';

import { createEditToolDefinition, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';

import type { CustomEditToolConfig } from '#src/config/schema.js';
import { CUSTOM_EDIT_DEFINITION } from '#src/features/custom-edit/definition.js';
import {
  applyCustomEdits,
  detectLineEnding,
  generateDiffString,
  generateUnifiedPatch,
  normalizeToLF,
  restoreLineEndings,
  stripBom,
} from '#src/features/custom-edit/edit-engine.js';
import {
  getCouldNotEditFileError,
  getInvalidInputError,
  throwIfAborted,
} from '#src/features/custom-edit/errors.js';
import { withMutationQueue } from '#src/features/custom-edit/mutation-queue.js';
import { createCustomEditParametersSchema } from '#src/features/custom-edit/schema.js';
import { formatTemplate } from '#src/features/custom-edit/template.js';
import type {
  CustomEdit,
  CustomEditParameters,
  CustomEditToolDefinition,
  CustomEditToolOptions,
  EditOperations,
} from '#src/features/custom-edit/types.js';

export { applyCustomEdits } from '#src/features/custom-edit/edit-engine.js';

const defaultOperations: EditOperations = {
  readFile: (filePath) => fsReadFile(filePath),
  writeFile: (filePath, content) => fsWriteFile(filePath, content, 'utf8'),
  access: (filePath) => fsAccess(filePath, constants.R_OK | constants.W_OK),
};

export function registerCustomEditTool(
  pi: ExtensionAPI,
  config: { customEdit: CustomEditToolConfig }
): void {
  if (!config.customEdit.enabled) return;
  pi.registerTool(createCustomEditToolDefinition(config.customEdit));
}

export function createCustomEditToolDefinition(
  _config: CustomEditToolConfig,
  options: CustomEditToolOptions = {}
): CustomEditToolDefinition {
  const cwd = options.cwd ?? process.cwd();
  const operations = options.operations ?? defaultOperations;
  const baseTool = options.baseTool ?? createEditToolDefinition(cwd);
  const parameters = createCustomEditParametersSchema(baseTool.parameters);

  return {
    ...baseTool,
    name: CUSTOM_EDIT_DEFINITION.name,
    label: CUSTOM_EDIT_DEFINITION.label,
    description: CUSTOM_EDIT_DEFINITION.description,
    promptSnippet: CUSTOM_EDIT_DEFINITION.promptSnippet,
    promptGuidelines: CUSTOM_EDIT_DEFINITION.promptGuidelines,
    parameters,
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      if (!hasReplaceAllEdit(params.edits)) {
        return baseTool.execute(toolCallId, params, signal, onUpdate, ctx);
      }

      const result = await executeReplaceAllEdit(params, cwd, operations, signal);
      const diffResult = generateDiffString(result.baseContent, result.newContent);
      const patch = generateUnifiedPatch(params.path, result.baseContent, result.newContent);
      return {
        content: [
          {
            type: 'text',
            text: formatTemplate(CUSTOM_EDIT_DEFINITION.messages.success, {
              count: result.replacementCount,
              path: params.path,
            }),
          },
        ],
        details: { diff: diffResult.diff, patch, firstChangedLine: diffResult.firstChangedLine },
      };
    },
    renderCall(args, theme, context) {
      if (!hasReplaceAllEdit(args?.edits)) {
        return baseTool.renderCall?.(args, theme, context) ?? new Text('', 0, 0);
      }

      const text =
        context.lastComponent instanceof Text ? context.lastComponent : new Text('', 0, 0);
      const pathDisplay = args?.path
        ? path.relative(context.cwd, path.resolve(context.cwd, args.path))
        : '';
      text.setText(
        `${theme.fg('toolTitle', theme.bold('edit'))} ${theme.fg('toolOutput', pathDisplay)} ${theme.fg('muted', '(replaceAll)')}`
      );
      return text;
    },
  };
}

export async function executeReplaceAllEdit(
  params: CustomEditParameters,
  cwd: string,
  operations: EditOperations = defaultOperations,
  signal?: AbortSignal
): Promise<{ baseContent: string; newContent: string; replacementCount: number }> {
  if (!Array.isArray(params.edits) || params.edits.length === 0) throw getInvalidInputError();

  const absolutePath = path.resolve(cwd, params.path);
  throwIfAborted(signal);

  return withMutationQueue(absolutePath, async () => {
    try {
      await operations.access(absolutePath);
    } catch (error) {
      throwIfAborted(signal);
      throw getCouldNotEditFileError(params.path, error);
    }

    throwIfAborted(signal);
    const buffer = await operations.readFile(absolutePath);
    const rawContent = buffer.toString('utf8');
    throwIfAborted(signal);

    const { bom, text: content } = stripBom(rawContent);
    const lineEnding = detectLineEnding(content);
    const normalizedContent = normalizeToLF(content);
    const { baseContent, newContent, replacementCount } = applyCustomEdits(
      normalizedContent,
      params.edits,
      params.path
    );
    const finalContent = bom + restoreLineEndings(newContent, lineEnding);

    await operations.writeFile(absolutePath, finalContent);
    throwIfAborted(signal);

    return { baseContent, newContent, replacementCount };
  });
}

function hasReplaceAllEdit(edits: CustomEdit[] | undefined): boolean {
  return edits?.some((edit) => edit.replaceAll === true) ?? false;
}
