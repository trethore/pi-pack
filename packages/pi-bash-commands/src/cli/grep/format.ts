import { createCompactPathFormatter } from '#pi-bash-commands-cli/shared/paths';
import type { GrepMatch } from '#pi-bash-commands-cli/shared/ripgrep';

interface GrepDisplay {
  matches: GrepMatch[];
  files: number;
  globalLimited: boolean;
  perFileLimitedFiles: Set<string>;
}

interface GrepFormatOptions {
  matches: readonly GrepMatch[];
  limit: number;
  paths: readonly string[];
  limitPerFile?: number;
  limited: boolean;
}

export function formatGrepResult(options: GrepFormatOptions): string {
  const display = createGrepDisplay(options);
  const header = `matches=${display.matches.length} files=${display.files}`;
  const body = display.matches.length === 0 ? header : [header, ...formatFiles(display)].join('\n');
  return display.globalLimited ? `${body}\n[more matches available]` : body;
}

function createGrepDisplay(options: GrepFormatOptions): GrepDisplay {
  const matches = normalizeMatches(options.matches, options.paths);
  const displayedMatches: GrepMatch[] = [];
  const displayedPerFile = new Map<string, number>();
  const perFileLimitedFiles = new Set<string>();
  let globalLimited = options.limited;

  for (const match of matches) {
    const fileCount = displayedPerFile.get(match.file) ?? 0;
    if (options.limitPerFile !== undefined && fileCount >= options.limitPerFile) {
      perFileLimitedFiles.add(match.file);
      continue;
    }
    if (displayedMatches.length >= options.limit) {
      globalLimited = true;
      break;
    }
    displayedMatches.push(match);
    displayedPerFile.set(match.file, fileCount + 1);
  }

  return {
    matches: displayedMatches,
    files: new Set(displayedMatches.map((match) => match.file)).size,
    globalLimited,
    perFileLimitedFiles,
  };
}

function normalizeMatches(matches: readonly GrepMatch[], paths: readonly string[]): GrepMatch[] {
  const formatPath = createCompactPathFormatter(paths);
  const normalizedMatches: GrepMatch[] = [];
  const seenMatches = new Set<string>();

  for (const match of matches) {
    const normalizedMatch = { ...match, file: formatPath(match.file) || '.' };
    const key = `${normalizedMatch.file}\0${normalizedMatch.line}\0${normalizedMatch.text}`;
    if (seenMatches.has(key)) continue;
    seenMatches.add(key);
    normalizedMatches.push(normalizedMatch);
  }

  return normalizedMatches.sort((left, right) => left.file.localeCompare(right.file) || left.line - right.line);
}

function formatFiles(display: GrepDisplay): string[] {
  const files = new Map<string, GrepMatch[]>();
  for (const match of display.matches) {
    const matches = files.get(match.file) ?? [];
    matches.push(match);
    files.set(match.file, matches);
  }

  const lines: string[] = [];
  for (const [file, matches] of files) {
    lines.push(file, ...matches.map((match) => `${match.line}: ${match.text}`));
    if (display.perFileLimitedFiles.has(file)) lines.push('[more matches in this file]');
  }
  return lines;
}
