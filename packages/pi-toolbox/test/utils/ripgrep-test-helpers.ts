import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function writeDepthFixture(cwd: string, contents: { root: string; child: string; grandchild: string }): void {
  mkdirSync(path.join(cwd, 'nested', 'deep'), { recursive: true });
  writeFileSync(path.join(cwd, 'root.txt'), contents.root);
  writeFileSync(path.join(cwd, 'nested', 'child.txt'), contents.child);
  writeFileSync(path.join(cwd, 'nested', 'deep', 'grandchild.txt'), contents.grandchild);
}

export function writeIndependentDepthFixture(cwd: string, contents: { child: string; grandchild: string }): void {
  mkdirSync(path.join(cwd, 'root', 'nested', 'deep'), { recursive: true });
  writeFileSync(path.join(cwd, 'root', 'nested', 'child.txt'), contents.child);
  writeFileSync(path.join(cwd, 'root', 'nested', 'deep', 'grandchild.txt'), contents.grandchild);
}

export function writeHiddenGitFixture(
  cwd: string,
  contents: { hidden: string; gitConfig: string; gitObject: string }
): void {
  mkdirSync(path.join(cwd, '.git', 'objects'), { recursive: true });
  writeFileSync(path.join(cwd, '.env.example'), contents.hidden);
  writeFileSync(path.join(cwd, '.git', 'config'), contents.gitConfig);
  writeFileSync(path.join(cwd, '.git', 'objects', 'object-file'), contents.gitObject);
}

export function writeHiddenIgnoredFixture(cwd: string, contents: { ignored: string; hidden: string }): void {
  writeFileSync(path.join(cwd, '.gitignore'), 'ignored.txt\n');
  writeFileSync(path.join(cwd, 'ignored.txt'), contents.ignored);
  writeFileSync(path.join(cwd, '.env.example'), contents.hidden);
}
