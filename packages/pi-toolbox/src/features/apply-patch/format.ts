export interface ApplyPatchSummary {
  added: string[];
  modified: string[];
  deleted: string[];
}

export function formatApplyPatchSummary(summary: ApplyPatchSummary): string {
  return [
    'Success. Updated the following files:',
    ...summary.added.map((file) => `A ${file}`),
    ...summary.modified.map((file) => `M ${file}`),
    ...summary.deleted.map((file) => `D ${file}`),
  ].join('\n');
}

export function countApplyPatchSummary(summary: ApplyPatchSummary): number {
  return summary.added.length + summary.modified.length + summary.deleted.length;
}
