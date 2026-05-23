import { toDisplayPath } from '#src/utils/paths.js';
import { sortedItems } from '#src/utils/sorted-items.js';

export interface FindFilesFormatOptions {
  paths: readonly string[];
  files: readonly string[];
  limited?: boolean;
}

interface TreeNode {
  children: Map<string, TreeNode>;
  isFile: boolean;
}

interface CompressedNode {
  label: string;
  node: TreeNode;
}

export function countFindFiles(files: readonly string[]): number {
  return normalizeFiles(files).length;
}

export function formatFindFilesResult(options: FindFilesFormatOptions): string {
  const root = createNode();
  const files = normalizeFiles(options.files);

  for (const file of files) {
    addPath(root, file);
  }

  const footer = options.limited ? ['[more files available]'] : [];
  return [`found=${files.length}`, ...formatChildren(root, 0), ...footer].join('\n');
}

function createNode(): TreeNode {
  return { children: new Map(), isFile: false };
}

function normalizeFiles(files: readonly string[]): string[][] {
  const uniqueFiles = new Map<string, string[]>();

  for (const file of files) {
    const displayPath = toDisplayPath(file) || '.';
    const parts = splitDisplayPath(displayPath);
    if (parts.length > 0) uniqueFiles.set(displayPath, parts);
  }

  return sortedItems(uniqueFiles.entries(), ([left], [right]) => left.localeCompare(right)).map(
    ([, parts]) => parts
  );
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
    lines.push(
      `${indent}${compressed.label}${suffix}`,
      ...formatChildren(compressed.node, depth + 1)
    );
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
  return sortedItems(children.entries(), ([leftName, leftNode], [rightName, rightNode]) => {
    if (leftNode.isFile !== rightNode.isFile) return leftNode.isFile ? -1 : 1;
    return leftName.localeCompare(rightName);
  });
}
