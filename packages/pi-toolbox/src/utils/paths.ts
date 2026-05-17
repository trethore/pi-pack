import path from 'node:path';

interface CompactPathParts {
  rootLabel?: string;
  relativePath: string;
  displayPath: string;
}

interface CompactRoot {
  path: string;
  label: string;
}

export function formatRipgrepPaths(paths: readonly string[]): string[] {
  return paths.length === 1 && paths[0] === '.' ? [] : [...paths];
}

export function createCompactPathFormatter(
  searchPaths: readonly string[]
): (value: string) => string {
  const formatParts = createCompactPathPartsFormatter(searchPaths);

  return (value: string) => formatParts(value).displayPath;
}

function createCompactPathPartsFormatter(
  searchPaths: readonly string[]
): (value: string) => CompactPathParts {
  const roots = createCompactRoots(searchPaths);
  const includeRootLabels = roots.length > 1;

  return (value: string) => {
    const displayPath = toDisplayPath(value) || '.';
    const root = findBestRoot(roots, displayPath);
    if (root === undefined) return { relativePath: displayPath, displayPath };

    return formatRootedCompactPath(root, stripRoot(displayPath, root.path), includeRootLabels);
  };
}

export function toDisplayPath(value: string): string {
  return trimTrailingSlashes(toPosixPath(value).replace(/^\.\//, ''));
}

export function toPosixPath(value: string): string {
  return value.replaceAll('\\', '/');
}

export function toResolvedDisplayPath(cwd: string, value: string): string {
  return toDisplayPath(path.resolve(cwd, value));
}

function formatRootedCompactPath(
  root: CompactRoot,
  relativePath: string,
  includeRootLabel: boolean
): CompactPathParts {
  if (relativePath === '') return formatExactRootPath(root, includeRootLabel);
  if (!includeRootLabel || !root.label || root.label === '.') {
    return { relativePath, displayPath: relativePath };
  }

  return {
    rootLabel: root.label,
    relativePath,
    displayPath: `${root.label}/${relativePath}`,
  };
}

function formatExactRootPath(root: CompactRoot, includeRootLabel: boolean): CompactPathParts {
  const exactRootPath = root.label || '.';
  return {
    rootLabel: includeRootLabel && root.label !== '.' ? root.label : undefined,
    relativePath: includeRootLabel ? '' : exactRootPath,
    displayPath: exactRootPath,
  };
}

function createCompactRoots(searchPaths: readonly string[]): CompactRoot[] {
  const rootPaths = searchPaths.map((searchPath) => toDisplayPath(searchPath) || '.');
  const labels = createUniqueSuffixLabels(rootPaths);

  return rootPaths.map((rootPath, index) => ({ path: rootPath, label: labels[index] ?? rootPath }));
}

function createUniqueSuffixLabels(paths: readonly string[]): string[] {
  const pathSegments = paths.map((pathValue) => splitPathSegments(pathValue));
  const maxDepth = Math.max(1, ...pathSegments.map((segments) => segments.length));

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const labels = pathSegments.map((segments) => formatSuffix(segments, depth));
    if (new Set(labels).size === labels.length) return labels;
  }

  return paths.map((pathValue) => pathValue || '.');
}

function splitPathSegments(value: string): string[] {
  if (value === '.') return ['.'];
  return value.split('/').filter(Boolean);
}

function formatSuffix(segments: readonly string[], depth: number): string {
  return segments.slice(Math.max(0, segments.length - depth)).join('/') || '.';
}

function findBestRoot(roots: readonly CompactRoot[], displayPath: string): CompactRoot | undefined {
  let bestRoot: CompactRoot | undefined;

  for (const root of roots) {
    if (!pathBelongsToRoot(displayPath, root.path)) continue;
    if (bestRoot === undefined || root.path.length > bestRoot.path.length) bestRoot = root;
  }

  return bestRoot;
}

function pathBelongsToRoot(displayPath: string, rootPath: string): boolean {
  if (rootPath === '.') return !displayPath.startsWith('/');
  if (rootPath === '/') return displayPath.startsWith('/');
  return displayPath === rootPath || displayPath.startsWith(`${rootPath}/`);
}

function stripRoot(displayPath: string, rootPath: string): string {
  if (rootPath === '.') return displayPath;
  if (rootPath === '/') return displayPath.replace(/^\//, '');
  if (displayPath === rootPath) return '';
  return displayPath.slice(rootPath.length + 1);
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '') || value;
}
