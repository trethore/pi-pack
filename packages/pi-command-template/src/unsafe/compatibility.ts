import { AgentSession, DefaultResourceLoader, VERSION } from '@earendil-works/pi-coding-agent';

export interface CompatibilityCheckResult {
  warnings: string[];
  errors: string[];
}

export function checkUnsafeCompatibility(): CompatibilityCheckResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!DefaultResourceLoader?.prototype) {
    errors.push(
      'pi-command-template: incompatible Pi internals; DefaultResourceLoader is unavailable.'
    );
  }

  if (!AgentSession?.prototype) {
    errors.push('pi-command-template: incompatible Pi internals; AgentSession is unavailable.');
  }

  if (!isSupportedPiVersion(VERSION)) {
    warnings.push(
      `pi-command-template: declared support is Pi >=0.78.0 <1; current Pi version is ${VERSION}.`
    );
  }

  return { warnings, errors };
}

function isSupportedPiVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 0 && minor >= 78;
}
