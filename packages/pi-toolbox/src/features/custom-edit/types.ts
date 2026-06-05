import type { EditToolDetails, ToolDefinition } from '@earendil-works/pi-coding-agent';

import type { createCustomEditParametersSchema } from '#src/features/custom-edit/schema.js';

export type CustomEditParametersSchema = ReturnType<typeof createCustomEditParametersSchema>;

export type CustomEdit = {
  oldText: string;
  newText: string;
  replaceAll?: boolean;
};

export type CustomEditParameters = {
  path: string;
  edits: CustomEdit[];
};

export type EditOperations = {
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, content: string): Promise<void>;
  access(path: string): Promise<void>;
};

export type MatchedEdit = {
  editIndex: number;
  matchIndex: number;
  matchLength: number;
  newText: string;
};

export type CustomEditToolDefinition = ToolDefinition<
  CustomEditParametersSchema,
  EditToolDetails | undefined
>;

export interface CustomEditToolOptions {
  cwd?: string;
  baseTool?: CustomEditToolDefinition;
  operations?: EditOperations;
}

export interface CustomEditDefinition {
  name: string;
  label: string;
  description: string;
  promptSnippet: string;
  promptGuidelines: string[];
  replaceAllParameter: Record<string, unknown>;
  messages: {
    success: string;
  };
  errors: CustomEditErrorMessages;
}

export interface CustomEditErrorMessages {
  invalidInput: string;
  couldNotEditFile: string;
  notFoundSingle: string;
  notFoundMulti: string;
  duplicateSingle: string;
  duplicateMulti: string;
  emptyOldTextSingle: string;
  emptyOldTextMulti: string;
  noChangeSingle: string;
  noChangeMulti: string;
  overlap: string;
  aborted: string;
}
