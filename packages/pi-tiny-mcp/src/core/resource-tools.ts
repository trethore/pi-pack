import { normalizeName } from '#src/utils/names.js';

export function resourceNameToToolName(name: string): string {
  return normalizeResourceToolPart(name) || 'resource';
}

export function resourceUriToToolSuffix(uri: string): string {
  const pathLike = uri.replace(/^\w+:(\/\/)?/, '').replace(/[?#].*$/, '');
  const segments = pathLike.split('/').filter(Boolean);
  const lastSegments = segments.slice(-2).join('_');
  return normalizeResourceToolPart(lastSegments || uri);
}

function normalizeResourceToolPart(value: string): string {
  return normalizeName(value).toLowerCase();
}
