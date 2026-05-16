import { toDisplayPath, toPosixPath } from '#src/utils/paths.js';

export interface GlobFormatOptions {
  paths: readonly string[];
  files: readonly string[];
  limited?: boolean;
}

interface TreeNode {
  children: Map<string, TreeNode>;
  isFile: boolean;
}

export function formatGlobResult(options: GlobFormatOptions): string {
  const root = createNode();
  const files = normalizeFiles(options.files);

  for (const file of files) {
    addPath(root, file);
  }

  const header = `paths=${formatPaths(options.paths)} count=${files.length}`;
  const footer = options.limited ? ['[more files available]'] : [];
  return [header, ...formatChildren(root, 0), ...footer].join('\n');
}

function createNode(): TreeNode {
  return { children: new Map(), isFile: false };
}

function normalizeFiles(files: readonly string[]): string[] {
  const uniqueFiles = new Set(files.map((file) => toDisplayPath(file)).filter(Boolean));
  return sortedItems(uniqueFiles, (left, right) => left.localeCompare(right));
}

function addPath(root: TreeNode, filePath: string): void {
  const parts = filePath.split('/').filter(Boolean);
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
    const indent = '  '.repeat(depth);
    const suffix = child.isFile ? '' : '/';
    lines.push(`${indent}${name}${suffix}`, ...formatChildren(child, depth + 1));
  }

  return lines;
}

function sortedEntries(children: Map<string, TreeNode>): [string, TreeNode][] {
  return sortedItems(children.entries(), ([leftName, leftNode], [rightName, rightNode]) => {
    if (leftNode.isFile !== rightNode.isFile) return leftNode.isFile ? -1 : 1;
    return leftName.localeCompare(rightName);
  });
}

function sortedItems<T>(items: Iterable<T>, compare: (left: T, right: T) => number): T[] {
  const sorted: T[] = [];

  for (const item of items) {
    const index = sorted.findIndex((sortedItem) => compare(item, sortedItem) < 0);
    if (index === -1) {
      sorted.push(item);
    } else {
      sorted.splice(index, 0, item);
    }
  }

  return sorted;
}

function formatPaths(paths: readonly string[]): string {
  return paths.map((pathValue) => toPosixPath(pathValue) || '.').join(',');
}
