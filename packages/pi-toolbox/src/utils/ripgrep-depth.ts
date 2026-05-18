export function formatRipgrepDepthArgs(depth: number | undefined): string[] {
  return depth === undefined ? [] : ['--max-depth', String(depth)];
}
