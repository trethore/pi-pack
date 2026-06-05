import { CUSTOM_EDIT_DEFINITION } from '#src/features/custom-edit/definition.js';
import { formatTemplate } from '#src/features/custom-edit/template.js';

const ERRORS = CUSTOM_EDIT_DEFINITION.errors;

export function getInvalidInputError(): Error {
  return new Error(ERRORS.invalidInput);
}

export function getCouldNotEditFileError(filePath: string, error: unknown): Error {
  const errorMessage =
    error instanceof Error && 'code' in error ? `Error code: ${error.code}` : String(error);
  return new Error(
    formatTemplate(ERRORS.couldNotEditFile, { path: filePath, error: errorMessage })
  );
}

export function getNotFoundError(filePath: string, editIndex: number, totalEdits: number): Error {
  return new Error(
    formatTemplate(totalEdits === 1 ? ERRORS.notFoundSingle : ERRORS.notFoundMulti, {
      path: filePath,
      index: editIndex,
    })
  );
}

export function getDuplicateError(
  filePath: string,
  editIndex: number,
  totalEdits: number,
  occurrences: number
): Error {
  return new Error(
    formatTemplate(totalEdits === 1 ? ERRORS.duplicateSingle : ERRORS.duplicateMulti, {
      path: filePath,
      index: editIndex,
      occurrences,
    })
  );
}

export function getEmptyOldTextError(
  filePath: string,
  editIndex: number,
  totalEdits: number
): Error {
  return new Error(
    formatTemplate(totalEdits === 1 ? ERRORS.emptyOldTextSingle : ERRORS.emptyOldTextMulti, {
      path: filePath,
      index: editIndex,
    })
  );
}

export function getNoChangeError(filePath: string, totalEdits: number): Error {
  return new Error(
    formatTemplate(totalEdits === 1 ? ERRORS.noChangeSingle : ERRORS.noChangeMulti, {
      path: filePath,
    })
  );
}

export function getOverlapError(
  filePath: string,
  previousEditIndex: number,
  currentEditIndex: number
): Error {
  return new Error(
    formatTemplate(ERRORS.overlap, {
      path: filePath,
      previousIndex: previousEditIndex,
      currentIndex: currentEditIndex,
    })
  );
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new Error(ERRORS.aborted);
}
