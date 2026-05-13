#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryUrl = 'https://github.com/earendil-works/pi.git';
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(scriptDirectory, '..');
const referencesDirectory = path.resolve(rootDirectory, 'references');
const targetDirectory = path.resolve(referencesDirectory, 'pi-mono');

function runGitClone(): void {
  const result = spawnSync('git', ['clone', repositoryUrl, targetDirectory], {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`git clone failed with exit code ${result.status ?? 'unknown'}`);
  }
}

console.log(`Removing existing pi-mono reference: ${targetDirectory}`);
rmSync(targetDirectory, { recursive: true, force: true });

mkdirSync(referencesDirectory, { recursive: true });

console.log(`Cloning ${repositoryUrl} into ${targetDirectory}`);
runGitClone();

console.log('Removing cloned Git metadata');
rmSync(path.resolve(targetDirectory, '.git'), { recursive: true, force: true });

console.log(`Imported pi-mono into ${targetDirectory}`);
