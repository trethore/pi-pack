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

  if (!VERSION.startsWith('0.78.')) {
    warnings.push(
      `pi-command-template: tested against Pi 0.78.x; current Pi version is ${VERSION}.`
    );
  }

  return { warnings, errors };
}
