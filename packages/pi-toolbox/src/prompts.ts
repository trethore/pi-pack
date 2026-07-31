export const APPLY_PATCH_PROMPT = {
  tool: {
    description: [
      'Apply a patch using a simplified, file-oriented diff format.',
      'Patch must start with `*** Begin Patch` and end with `*** End Patch`. Supported hunks are `*** Add File:`, `*** Delete File:`, and `*** Update File:` with optional `*** Move to:`.',
      'Add targets and move destinations must not already exist.',
      'Automatically creates parent directories. Optionally, specify a working directory to resolve relative paths.',
    ].join('\n'),
    promptSnippet: 'Apply add, update, delete, and move file edits from a patch',
    promptGuidelines: [
      'Use `apply_patch` to edit file contents or file paths using the Codex apply_patch format.',
      'The `apply_patch` input must start with `*** Begin Patch\n` and end with `*** End Patch\n`.',
      '`apply_patch` supports `*** Add File:`, `*** Delete File:`, and `*** Update File:` hunks with optional `*** Move to:`.',
      '`apply_patch` requires add targets and move destinations not to exist.',
      'Relative paths passed to `apply_patch` are resolved against `workdir` when provided; otherwise, they are resolved against the current working directory.',
    ],
  },
  parameters: {
    patch: 'Patch to apply.',
    workdir:
      'Working directory for resolving relative paths in the patch. Set to null to use the current working directory.',
  },
};
