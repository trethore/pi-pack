import type { PermissionDecision } from '#src/config/schema.js';

export interface PermissionMatch {
  decision: PermissionDecision;
  pattern: string;
}

export function resolvePermission(
  command: string,
  permissions: Record<string, PermissionDecision>
): PermissionMatch {
  let best:
    | { decision: PermissionDecision; pattern: string; specificity: number; index: number }
    | undefined;
  const entries = Object.entries(permissions);

  for (const [index, [pattern, decision]] of entries.entries()) {
    if (!matchesPattern(command, pattern)) continue;

    const specificity = getPatternSpecificity(pattern);
    if (
      !best ||
      specificity > best.specificity ||
      (specificity === best.specificity && index > best.index)
    ) {
      best = { decision, pattern, specificity, index };
    }
  }

  if (!best) return { decision: 'deny', pattern: '<default>' };
  return { decision: best.decision, pattern: best.pattern };
}

export function matchesPattern(value: string, pattern: string): boolean {
  if (pattern.endsWith(' *') && value === pattern.slice(0, -2)) return true;

  const regex = new RegExp(`^${escapePattern(pattern)}$`);
  return regex.test(value);
}

function escapePattern(pattern: string): string {
  return pattern
    .split('*')
    .map((part) => part.replaceAll(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`))
    .join('.*');
}

function getPatternSpecificity(pattern: string): number {
  return pattern.replaceAll('*', '').length;
}
