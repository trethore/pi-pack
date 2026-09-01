import { AgentSession, DefaultResourceLoader, VERSION } from '@earendil-works/pi-coding-agent';

export interface PiContentTransformCompatibility {
  warnings: string[];
  errors: string[];
}

export function checkPiContentTransformCompatibility(): PiContentTransformCompatibility {
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!DefaultResourceLoader?.prototype) {
    errors.push('shared: DefaultResourceLoader is unavailable; Pi content transforms cannot be installed.');
  }

  if (!AgentSession?.prototype) {
    warnings.push('shared: AgentSession is unavailable; explicit skill invocation transforms are disabled.');
  }

  if (!isSupportedPiVersion(VERSION)) {
    warnings.push(`shared: Pi content transforms support Pi >=0.84.4 <1; current Pi version is ${VERSION}.`);
  }

  return { warnings, errors };
}

function isSupportedPiVersion(version: string): boolean {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return false;

  const [major, minor, patch] = match.slice(1).map(Number);
  const isExpectedMajor = major === 0;
  const isLaterMinor = minor !== undefined && minor > 84;
  const isMinimumSupportedVersion = minor === 84 && patch !== undefined && patch >= 4;
  const isSupportedVersion = isExpectedMajor && (isLaterMinor || isMinimumSupportedVersion);

  return isSupportedVersion;
}
