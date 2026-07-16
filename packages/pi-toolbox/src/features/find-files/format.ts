import { createCompactPathFormatter } from '#src/utils/paths.js';

export interface FindFilesFormatOptions {
  paths: readonly string[];
  files: readonly string[];
  limited?: boolean;
}

export interface FindFilesDisplay {
  files: string[][];
  count: number;
  limited: boolean;
}

interface TreeNode {
  children: Map<string, TreeNode>;
  isFile: boolean;
}

interface CompressedNode {
  label: string;
  node: TreeNode;
}

export function createFindFilesDisplay(options: FindFilesFormatOptions): FindFilesDisplay {
  const files = normalizeFiles(options.files, options.paths);
  return { files, count: files.length, limited: options.limited ?? false };
}

export function formatFindFilesResult(options: FindFilesFormatOptions): string {
  return formatFindFilesDisplay(createFindFilesDisplay(options));
}

export function formatFindFilesDisplay(display: FindFilesDisplay): string {
  const root = createNode();

  for (const file of display.files) {
    addPath(root, file);
  }

  const footer = display.limited ? ['[more files available]'] : [];
  return [`found=${display.count}`, ...formatChildren(root, 0), ...footer].join('\n');
}

function createNode(): TreeNode {
  return { children: new Map(), isFile: false };
}

function normalizeFiles(files: readonly string[], paths: readonly string[]): string[][] {
  const formatPath = createCompactPathFormatter(paths);
  const uniqueFiles = new Map<string, string[]>();

  for (const file of files) {
    const displayPath = formatPath(file) || '.';
    const parts = splitDisplayPath(displayPath);
    if (parts.length > 0) uniqueFiles.set(displayPath, parts);
  }

  return [...uniqueFiles.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, parts]) => parts);
}

function splitDisplayPath(displayPath: string): string[] {
  const parts = displayPath.split('/').filter(Boolean);
  if (!displayPath.startsWith('/')) return parts;

  const [firstPart, ...remainingParts] = parts;
  return firstPart === undefined ? ['/'] : [`/${firstPart}`, ...remainingParts];
}

function addPath(root: TreeNode, parts: readonly string[]): void {
  let node = root;

  for (const part of parts) {
    const child = node.children.get(part) ?? createNode();
    node.children.set(part, child);
    node = child;
  }

  node.isFile = true;
}

function formatChildren(node: TreeNode, depth: number): string[] {
  const lines: string[] = [];

  for (const [name, child] of sortedEntries(node.children)) {
    const compressed = compressNode(name, child);
    const indent = '  '.repeat(depth);
    const suffix = compressed.node.isFile ? '' : '/';
    lines.push(`${indent}${compressed.label}${suffix}`, ...formatChildren(compressed.node, depth + 1));
  }

  return lines;
}

function compressNode(name: string, node: TreeNode): CompressedNode {
  let label = name;
  let current = node;

  while (!current.isFile && current.children.size === 1) {
    const [[childName, child]] = current.children;
    label = joinPathLabel(label, childName);
    current = child;
  }

  return { label, node: current };
}

function joinPathLabel(left: string, right: string): string {
  return left === '/' ? `/${right}` : `${left}/${right}`;
}

function sortedEntries(children: Map<string, TreeNode>): [string, TreeNode][] {
  return [...children.entries()].sort(([leftName, leftNode], [rightName, rightNode]) => {
    if (leftNode.isFile !== rightNode.isFile) return leftNode.isFile ? -1 : 1;
    return leftName.localeCompare(rightName);
  });
}
