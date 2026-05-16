import { createCompactPathFormatter } from '#src/utils/paths.js';

interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

export interface GrepFormatOptions {
  matches: readonly GrepMatch[];
  limit: number;
  paths?: readonly string[];
  limitPerFile?: number;
  limited?: boolean;
}

export interface GrepDisplay {
  matches: GrepMatch[];
  files: number;
  globalLimited: boolean;
  perFileLimitedFiles: Set<string>;
}

export function formatGrepResult(options: GrepFormatOptions): string {
  return formatGrepDisplay(createGrepDisplay(options));
}

export function formatGrepDisplay(display: GrepDisplay): string {
  const files = groupMatchesByFile(display.matches);
  const header = `matches=${display.matches.length} files=${display.files}`;

  if (display.matches.length === 0) return formatWithGlobalFooter(header, display);

  return formatWithGlobalFooter(
    [header, '', ...formatFiles(files, display.perFileLimitedFiles)].join('\n'),
    display
  );
}

export function createGrepDisplay(options: GrepFormatOptions): GrepDisplay {
  const matches = normalizeMatches(options.matches, options.paths ?? ['.']);
  const displayedMatches: GrepMatch[] = [];
  const displayedPerFile = new Map<string, number>();
  const perFileLimitedFiles = new Set<string>();
  let globalLimited = options.limited ?? false;

  for (const match of matches) {
    if (displayedMatches.length >= options.limit) {
      globalLimited = true;
      break;
    }

    const fileCount = displayedPerFile.get(match.file) ?? 0;
    if (options.limitPerFile !== undefined && fileCount >= options.limitPerFile) {
      perFileLimitedFiles.add(match.file);
      continue;
    }

    displayedMatches.push(match);
    displayedPerFile.set(match.file, fileCount + 1);
  }

  return {
    matches: displayedMatches,
    files: countFiles(displayedMatches),
    globalLimited,
    perFileLimitedFiles,
  };
}

function formatWithGlobalFooter(text: string, display: GrepDisplay): string {
  if (!display.globalLimited) return text;
  return `${text}\n\n[more matches available]`;
}

function normalizeMatches(matches: readonly GrepMatch[], paths: readonly string[]): GrepMatch[] {
  const formatPath = createCompactPathFormatter(paths);
  return matches.map((match) => ({ ...match, file: formatPath(match.file) || '.' }));
}

function countFiles(matches: readonly GrepMatch[]): number {
  return new Set(matches.map((match) => match.file)).size;
}

function groupMatchesByFile(matches: readonly GrepMatch[]): Map<string, GrepMatch[]> {
  const files = new Map<string, GrepMatch[]>();

  for (const match of matches) {
    const fileMatches = files.get(match.file) ?? [];
    fileMatches.push(match);
    files.set(match.file, fileMatches);
  }

  return files;
}

function formatFiles(files: Map<string, GrepMatch[]>, perFileLimitedFiles: Set<string>): string[] {
  const lines: string[] = [];

  for (const [file, matches] of files) {
    lines.push(
      ...(lines.length > 0 ? [''] : []),
      file,
      ...formatFileMatches(file, matches, perFileLimitedFiles)
    );
  }

  return lines;
}

function formatFileMatches(
  file: string,
  matches: GrepMatch[],
  perFileLimitedFiles: Set<string>
): string[] {
  const lines = matches.map((match) => formatMatch(match));
  return [...lines, ...(perFileLimitedFiles.has(file) ? ['[more matches in this file]'] : [])];
}

function formatMatch(match: GrepMatch): string {
  return `${match.line}: ${match.text}`;
}
