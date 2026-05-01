import { existsSync, readFileSync } from 'node:fs';
import { parse, printParseErrorCode, type ParseError } from 'jsonc-parser';
import { isRecord } from '#src/config/merge.js';
import type { PartialPiCutConfig } from '#src/config/schema.js';

export function readConfigFile(
  configPath: string,
  errors: string[]
): PartialPiCutConfig | undefined {
  if (!existsSync(configPath)) return undefined;

  const parseErrors: ParseError[] = [];
  const contents = readFileSync(configPath, 'utf8');
  const parsed = parse(contents, parseErrors, {
    allowTrailingComma: true,
    disallowComments: false,
  }) as unknown;

  if (parseErrors.length > 0) {
    errors.push(formatParseErrors(configPath, parseErrors));
    return undefined;
  }

  if (!isRecord(parsed)) {
    errors.push(`pi-cut config ignored: ${configPath} must contain a JSON object.`);
    return undefined;
  }

  return parsed;
}

function formatParseErrors(configPath: string, parseErrors: ParseError[]): string {
  const messages = parseErrors.map(
    (error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`
  );
  return `pi-cut config ignored: ${configPath} has JSONC parse errors: ${messages.join(', ')}.`;
}
