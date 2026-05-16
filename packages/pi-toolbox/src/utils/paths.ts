import path from 'node:path';

export function formatRipgrepPaths(paths: readonly string[]): string[] {
  return paths.length === 1 && paths[0] === '.' ? [] : [...paths];
}

export function toDisplayPath(value: string): string {
  return toPosixPath(value).replace(/^\.\//, '');
}

export function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}
