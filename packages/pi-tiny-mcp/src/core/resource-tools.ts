export function resourceNameToToolName(name: string): string {
  return (
    name
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, '_')
      .replaceAll(/^_|_$/g, '') || 'resource'
  );
}
