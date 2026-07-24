import { Type } from 'typebox';

import { SEARCH_PROMPT } from '#src/prompts.js';

export function createSearchPathsSchema(description: string) {
  return Type.Optional(Type.Array(Type.String(), { minItems: 1, description }));
}

export function createSearchDepthSchema() {
  return Type.Optional(
    Type.Integer({
      minimum: 1,
      description: SEARCH_PROMPT.parameters.depth,
    })
  );
}

export function createNoIgnoreSchema() {
  return Type.Optional(
    Type.Boolean({
      description: SEARCH_PROMPT.parameters.noIgnore,
    })
  );
}

export function createVisibleOnlySchema() {
  return Type.Optional(
    Type.Boolean({
      description: SEARCH_PROMPT.parameters.visibleOnly,
    })
  );
}
