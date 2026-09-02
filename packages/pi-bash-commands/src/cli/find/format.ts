import { createCompactPathFormatter } from '#pi-bash-commands-cli/shared/paths';

interface TreeNode {
  children: Map<string, TreeNode>;
  isFile: boolean;
}

interface CompressedNode {
  label: string;
  node: TreeNode;
}

export function formatFindResult(options: {
  paths: readonly string[];
  files: readonly string[];
  limited: boolean;
}): string {
  const files = normalizeFiles(options.files, options.paths);
  const formattedFiles = formatFiles(files);

  return [`found=${files.length}`, ...formattedFiles, ...(options.limited ? ['[more files available]'] : [])].join(
    '\n'
  );
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

function formatFiles(files: readonly string[][]): string[] {
  const flatFiles = files.map((file) => file.join('/'));
  const treeFiles = formatTreeFiles(files);

  return flatFiles.join('\n').length <= treeFiles.join('\n').length ? flatFiles : treeFiles;
}

function formatTreeFiles(files: readonly string[][]): string[] {
  const root = createNode();
  for (const file of files) addPath(root, file);
  return formatChildren(root, 0);
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
    lines.push(
      `${indent}${compressed.label}${compressed.node.isFile ? '' : '/'}`,
      ...formatChildren(compressed.node, depth + 1)
    );
  }
  return lines;
}

function compressNode(name: string, node: TreeNode): CompressedNode {
  let label = name;
  let current = node;

  while (!current.isFile && current.children.size === 1) {
    const childEntry = current.children.entries().next().value;
    if (!childEntry) break;
    const [childName, child] = childEntry;
    label = label === '/' ? `/${childName}` : `${label}/${childName}`;
    current = child;
  }
  return { label, node: current };
}

function sortedEntries(children: Map<string, TreeNode>): [string, TreeNode][] {
  return [...children.entries()].sort(([leftName, leftNode], [rightName, rightNode]) => {
    if (leftNode.isFile !== rightNode.isFile) return leftNode.isFile ? -1 : 1;
    return leftName.localeCompare(rightName);
  });
}
