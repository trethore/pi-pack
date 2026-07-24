import { AgentSession, DefaultResourceLoader, VERSION } from '@earendil-works/pi-coding-agent';

export interface PiContentTransformCompatibility {
  warnings: string[];
  errors: string[];
}

export function checkPiContentTransformCompatibility(): PiContentTransformCompatibility {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!DefaultResourceLoader?.prototype) {
    errors.push('pi-shared: DefaultResourceLoader is unavailable; Pi content transforms cannot be installed.');
  }

  if (!AgentSession?.prototype) {
    warnings.push('pi-shared: AgentSession is unavailable; explicit skill invocation transforms are disabled.');
  }

  if (!isSupportedPiVersion(VERSION)) {
    warnings.push(`pi-shared: Pi content transforms support Pi >=0.82.0 <1; current Pi version is ${VERSION}.`);
  }

  return { warnings, errors };
}

function isSupportedPiVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;

  const [major, minor] = match.slice(1).map(Number);
  return major === 0 && minor !== undefined && minor >= 82;
}
