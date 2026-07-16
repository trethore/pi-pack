import { Type } from 'typebox';

export function createSearchPathsSchema(description: string) {
  return Type.Optional(Type.Array(Type.String(), { minItems: 1, description }));
}

export function createSearchDepthSchema() {
  return Type.Optional(
    Type.Integer({
      minimum: 1,
      description:
        'Maximum directory traversal depth relative to each search path. If provided, passes `--max-depth <depth>`. If omitted, traversal is unlimited.',
    })
  );
}

export function createNoIgnoreSchema() {
  return Type.Optional(
    Type.Boolean({
      description:
        'Include files ignored by .gitignore, .ignore, or other ripgrep ignore rules. If true, passes `--no-ignore`. If omitted, defaults to false.',
    })
  );
}

export function createVisibleOnlySchema() {
  return Type.Optional(
    Type.Boolean({
      description:
        'Search only non-hidden files and directories. If omitted or false, hidden files are included by default.',
    })
  );
}
