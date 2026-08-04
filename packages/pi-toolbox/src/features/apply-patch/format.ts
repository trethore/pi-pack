import type { ApplyPatchFailure } from '#src/features/apply-patch/apply.js';

export interface ApplyPatchSummary {
  added: string[];
  modified: string[];
  deleted: string[];
}

export function formatApplyPatchSummary(summary: ApplyPatchSummary): string {
  return ['Patch applied:', ...formatApplyPatchChanges(summary)].join('\n');
}

export function countApplyPatchSummary(summary: ApplyPatchSummary): number {
  return summary.added.length + summary.modified.length + summary.deleted.length;
}

export function formatApplyPatchFailure(error: ApplyPatchFailure): string {
  const completedChanges = formatApplyPatchChanges(error.completed);
  const partiallyApplied = completedChanges.length > 0 || error.writtenMoveDestination !== undefined;
  const lines = [partiallyApplied ? 'Patch partially applied:' : 'Patch failed:', ...completedChanges];

  if (completedChanges.length > 0) lines.push('');
  lines.push(formatFailedOperation(error));
  return lines.join('\n');
}

function formatApplyPatchChanges(summary: ApplyPatchSummary): string[] {
  return [
    ...summary.added.map((file) => `A ${file}`),
    ...summary.modified.map((file) => `M ${file}`),
    ...summary.deleted.map((file) => `D ${file}`),
  ];
}

function formatFailedOperation(error: ApplyPatchFailure): string {
  const operation = formatOperation(error);
  const message =
    error.writtenMoveDestination === undefined
      ? error.message
      : `${error.message}, but ${error.writtenMoveDestination} was written.`;
  return `${operation}: ${message}`;
}

function formatOperation(error: ApplyPatchFailure): string {
  const hunk = error.hunk;
  if (hunk.type === 'add') return `Failed to add file ${hunk.path}`;
  if (hunk.type === 'delete') return `Failed to delete file ${hunk.path}`;
  if (hunk.movePath === undefined) return `Failed to update file ${hunk.path}`;
  return `Failed to move file ${hunk.path} to ${hunk.movePath}`;
}
