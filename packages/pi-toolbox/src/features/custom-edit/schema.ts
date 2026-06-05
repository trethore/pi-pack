import { Type } from 'typebox';

import { CUSTOM_EDIT_DEFINITION } from '#src/features/custom-edit/definition.js';
import type { CustomEditParameters } from '#src/features/custom-edit/types.js';
import { cloneJsonSchema } from '#src/utils/tool-definition.js';

export function createCustomEditParametersSchema(baseParameters: unknown) {
  const parameters = cloneJsonSchema(
    baseParameters as {
      properties: {
        edits: {
          items: {
            properties: Record<string, unknown>;
          };
        };
      };
    }
  );

  parameters.properties.edits.items.properties.replaceAll =
    CUSTOM_EDIT_DEFINITION.replaceAllParameter;

  return Type.Unsafe<CustomEditParameters>(parameters);
}
