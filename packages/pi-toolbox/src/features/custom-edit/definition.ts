import { readJsonDefinition } from '#src/utils/tool-definition.js';
import type { CustomEditDefinition } from '#src/features/custom-edit/types.js';

export const CUSTOM_EDIT_DEFINITION = readJsonDefinition<CustomEditDefinition>(
  new URL('custom-edit-definition.json', import.meta.url)
);
